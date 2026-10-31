import { ApiError } from '@wbfm/shared/errors';
import { type SkillDiskEntry, type SkillInfo, type SkillManifest } from '@wbfm/shared/types';
import type { SkillVersionsResponse, SkillVersionDeleteResponse } from '@wbfm/shared/schemas';
import { getDataDir } from '@wbfm/config';
import { createSkillStateRepository, type SkillStateRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { loadSkillsFromDisk } from './loader';
import { ensureBuiltinSkills } from './builtin-skills';
import { createSkillVersionService } from './skill-version-service';

export interface SkillServiceOptions {
  /** 测试注入：替换技能目录（默认 <dataDir>/skills） */
  skillsDir?: string;
  /** 测试注入：版本快照根目录（默认与 skillsDir 同级 skill-versions/） */
  versionsDir?: string;
  /** 测试注入：快照保留版本数（默认 5） */
  keepVersions?: number;
  /** 测试注入：单技能快照体积上限（默认 50 MB） */
  maxSnapshotBytes?: number;
  /** reconcile 时是否播种内置示例技能（默认 true） */
  seedBuiltins?: boolean;
}

/** 已启用且 manifest 有效的技能（对话装配用） */
export interface EnabledSkill {
  name: string;
  manifest: SkillManifest;
}

export interface SkillService {
  /**
   * 启动对齐：播种内置技能 → 扫盘 → 未登记的文件夹补登状态行（默认启用）。
   * 只增不改：已登记的行保留 enabled；sourcePath 漂移时修正。
   */
  reconcile(): void;
  /** 技能列表视图（状态行 join 磁盘扫描；文件夹缺失标 exists=false） */
  list(): SkillInfo[];
  /** 启停（不存在抛 ApiError.notFound） */
  setEnabled(id: string, enabled: boolean): SkillInfo;
  /** 删除引用：只删状态行，源文件夹保留（重启后文件夹仍在会重新登记为启用） */
  remove(id: string): void;
  /** 已启用且 manifest 有效的技能（prompt 注入与工具预绑定用） */
  getEnabledSkills(): EnabledSkill[];
  /** v2.14：版本快照列表（按创建时间倒序，标记 active） */
  listVersions(name: string): SkillVersionsResponse;
  /** v2.14：原子回退到指定版本快照（启用态不变），返回最新版本列表 */
  rollbackVersion(name: string, version: string): SkillVersionsResponse;
  /** v2.15：删除非启用版本快照，返回删除结果与最新版本列表 */
  deleteVersion(name: string, version: string): SkillVersionDeleteResponse;
}

export function createSkillService(
  deps: Pick<ServiceDeps, 'db'>,
  options: SkillServiceOptions = {},
): SkillService {
  const repo: SkillStateRepository = createSkillStateRepository(deps.db);
  const skillsDir = options.skillsDir ?? getDataDir('skills');
  const seedBuiltins = options.seedBuiltins ?? true;
  const versions = createSkillVersionService(deps, {
    skillsDir,
    versionsDir: options.versionsDir,
    keep: options.keepVersions,
    maxSnapshotBytes: options.maxSnapshotBytes,
  });

  function toInfo(
    state: { id: string; name: string; enabled: boolean; sourcePath: string },
    entry: SkillDiskEntry | undefined,
  ): SkillInfo {
    if (!entry) {
      return {
        id: state.id,
        name: state.name,
        enabled: state.enabled,
        sourcePath: state.sourcePath,
        manifest: null,
        error: '源文件夹不存在（可能已被移动或删除）',
        exists: false,
      };
    }
    return {
      id: state.id,
      name: state.name,
      enabled: state.enabled,
      sourcePath: state.sourcePath,
      manifest: entry.manifest,
      error: entry.error,
      exists: true,
    };
  }

  /** 启动对齐：播种内置 → 扫盘补登状态行 → 校验通过的技能记录版本快照 */
  function reconcile(): void {
    if (seedBuiltins) ensureBuiltinSkills(skillsDir);
    for (const entry of loadSkillsFromDisk(skillsDir)) {
      let state = repo.getByName(entry.name);
      if (!state) {
        state = repo.create({ name: entry.name, enabled: true, sourcePath: entry.directoryPath });
      } else if (state.sourcePath !== entry.directoryPath) {
        state = repo.update(state.id, { sourcePath: entry.directoryPath }) ?? state;
      }
      if (entry.manifest) {
        try {
          versions.capture({
            stateId: state.id,
            name: entry.name,
            directoryPath: entry.directoryPath,
            manifest: entry.manifest,
          });
        } catch (error) {
          // 快照是旁路能力：磁盘异常不阻断技能加载
          console.warn(`[skill-version] 快照失败 ${entry.name}：`, error);
        }
      }
    }
  }

  return {
    reconcile,

    list() {
      const byName = new Map(loadSkillsFromDisk(skillsDir).map((entry) => [entry.name, entry]));
      return repo.list().map((state) => toInfo(state, byName.get(state.name)));
    },

    setEnabled(id, enabled) {
      const updated = repo.update(id, { enabled });
      if (!updated) throw ApiError.notFound('技能', id);
      const entry = loadSkillsFromDisk(skillsDir).find((item) => item.name === updated.name);
      return toInfo(updated, entry);
    },

    remove(id) {
      if (!repo.remove(id)) throw ApiError.notFound('技能', id);
    },

    getEnabledSkills() {
      const manifestByName = new Map(
        loadSkillsFromDisk(skillsDir)
          .filter((entry) => entry.manifest !== null)
          .map((entry) => [entry.name, entry.manifest!]),
      );
      return repo
        .list()
        .filter((state) => state.enabled)
        .flatMap((state) => {
          const manifest = manifestByName.get(state.name);
          return manifest ? [{ name: state.name, manifest }] : [];
        });
    },

    listVersions(name) {
      return versions.list(name);
    },

    rollbackVersion(name, version) {
      versions.rollback(name, version);
      // 回退后重扫，确保 manifest 与状态行、active_version 全部对齐
      reconcile();
      return versions.list(name);
    },

    deleteVersion(name, version) {
      const deleted = versions.delete(name, version);
      return { deleted, versions: versions.list(name) };
    },
  };
}
