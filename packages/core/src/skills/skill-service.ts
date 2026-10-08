import { ApiError } from '@wbfm/shared/errors';
import { type SkillDiskEntry, type SkillInfo, type SkillManifest } from '@wbfm/shared/types';
import { getDataDir } from '@wbfm/config';
import { createSkillStateRepository, type SkillStateRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { loadSkillsFromDisk } from './loader';
import { ensureBuiltinSkills } from './builtin-skills';

export interface SkillServiceOptions {
  /** 测试注入：替换技能目录（默认 <dataDir>/skills） */
  skillsDir?: string;
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
}

export function createSkillService(
  deps: Pick<ServiceDeps, 'db'>,
  options: SkillServiceOptions = {},
): SkillService {
  const repo: SkillStateRepository = createSkillStateRepository(deps.db);
  const skillsDir = options.skillsDir ?? getDataDir('skills');
  const seedBuiltins = options.seedBuiltins ?? true;

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

  return {
    reconcile() {
      if (seedBuiltins) ensureBuiltinSkills(skillsDir);
      for (const entry of loadSkillsFromDisk(skillsDir)) {
        const existing = repo.getByName(entry.name);
        if (existing) {
          if (existing.sourcePath !== entry.directoryPath) {
            repo.update(existing.id, { sourcePath: entry.directoryPath });
          }
          continue;
        }
        repo.create({ name: entry.name, enabled: true, sourcePath: entry.directoryPath });
      }
    },

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
  };
}
