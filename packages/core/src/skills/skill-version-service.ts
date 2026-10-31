import { randomUUID } from 'node:crypto';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import type { SkillVersionsResponse } from '@wbfm/shared/schemas';
import { SKILL_VERSION_KEEP, SKILL_VERSION_MAX_BYTES } from '@wbfm/shared/constants';
import {
  createSkillStateRepository,
  createSkillVersionRepository,
  type SkillVersionRow,
} from '@wbfm/database';
import type { SkillManifest } from '@wbfm/shared/types';
import type { ServiceDeps } from '../services/deps';
import { copySnapshot, digestDirectory, directorySize, versionDirName } from './skill-version-digest';

/** 快照体积超限时的健康问题码（不阻断技能加载，仅跳过快照） */
export const SKILL_VERSION_SNAPSHOT_TOO_LARGE = 'SKILL_VERSION_SNAPSHOT_TOO_LARGE';

export interface SkillVersionCaptureInput {
  stateId: string;
  name: string;
  directoryPath: string;
  manifest: SkillManifest;
}

export interface SkillVersionCaptureResult {
  snapshot: boolean;
  issue: string | null;
}

export interface SkillVersionServiceOptions {
  /** 技能目录（默认数据根 skills/）；快照默认放在其同级 skill-versions/ */
  skillsDir: string;
  /** 测试注入：快照根目录 */
  versionsDir?: string;
  /** 自动保留版本数（默认 5，永不删除 active） */
  keep?: number;
  /** 单技能目录快照上限（默认 50 MB） */
  maxSnapshotBytes?: number;
}

export interface SkillVersionService {
  /** 扫描确认后记录快照；同版本内容变化覆盖，checksum 相同只更新 active */
  capture(input: SkillVersionCaptureInput): SkillVersionCaptureResult;
  /** 版本列表（按创建时间倒序，标记 active） */
  list(name: string): SkillVersionsResponse;
  /** 原子回退到指定版本快照；成功后 active_version 指向该版本 */
  rollback(name: string, version: string): SkillVersionsResponse;
}

function compareIsoDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

export function createSkillVersionService(
  deps: Pick<ServiceDeps, 'db'>,
  options: SkillVersionServiceOptions,
): SkillVersionService {
  const repo = createSkillVersionRepository(deps.db);
  const stateRepo = createSkillStateRepository(deps.db);
  const versionsDir = options.versionsDir ?? join(dirname(options.skillsDir), 'skill-versions');
  const keep = options.keep ?? SKILL_VERSION_KEEP;
  const maxBytes = options.maxSnapshotBytes ?? SKILL_VERSION_MAX_BYTES;

  function setActive(stateId: string, version: string): void {
    const state = stateRepo.get(stateId);
    if (state?.activeVersion === version) return;
    stateRepo.update(stateId, { activeVersion: version });
  }

  /** 每个版本挑一行代表：优先当前状态行，其次最新行 */
  function representativeRows(name: string, stateId: string | null): SkillVersionRow[] {
    const byVersion = new Map<string, SkillVersionRow>();
    for (const row of repo.listByName(name)) {
      const existing = byVersion.get(row.version);
      if (!existing || row.skill_state_id === stateId) byVersion.set(row.version, row);
    }
    return [...byVersion.values()].sort((a, b) => compareIsoDesc(a.created_at, b.created_at));
  }

  /** 保留最近 keep 版 + active；删除行与不再被引用的快照目录 */
  function prune(name: string, activeVersion: string | null): void {
    const state = stateRepo.getByName(name);
    const reps = representativeRows(name, state?.id ?? null);
    const keepVersions = new Set<string>();
    reps.forEach((row, index) => {
      if (index < keep || row.version === activeVersion) keepVersions.add(row.version);
    });
    const keepIds = new Set(reps.filter((row) => keepVersions.has(row.version)).map((row) => row.id));
    const keepDirs = new Set(
      reps.filter((row) => keepVersions.has(row.version)).map((row) => row.dir_path),
    );
    for (const row of repo.listByName(name)) {
      if (keepIds.has(row.id)) continue;
      repo.remove(row.id);
      if (!keepDirs.has(row.dir_path)) rmSync(row.dir_path, { recursive: true, force: true });
    }
  }

  function list(name: string): SkillVersionsResponse {
    const state = stateRepo.getByName(name);
    const versions = representativeRows(name, state?.id ?? null).map((row) => ({
      id: row.id,
      version: row.version,
      checksum: row.checksum,
      sizeBytes: directorySize(row.dir_path),
      createdAt: row.created_at,
      active: state?.activeVersion === row.version,
    }));
    return { versions, versioningAvailable: versions.length > 0 };
  }

  return {
    capture(input) {
      const digest = digestDirectory(input.directoryPath, maxBytes);
      if (!digest) {
        console.warn(
          `[skill-version] ${SKILL_VERSION_SNAPSHOT_TOO_LARGE} ${input.name} v${input.manifest.version}`,
        );
        return { snapshot: false, issue: SKILL_VERSION_SNAPSHOT_TOO_LARGE };
      }
      const version = input.manifest.version;
      const manifestJson = JSON.stringify(input.manifest);
      const existing = repo.getByStateVersion(input.stateId, version);

      if (existing && existing.checksum === digest.checksum) {
        setActive(input.stateId, version);
        prune(input.name, version);
        return { snapshot: true, issue: null };
      }
      if (existing) {
        // 同版本内容变化：只保留最新内容
        copySnapshot(input.directoryPath, existing.dir_path);
        repo.update(existing.id, { checksum: digest.checksum, manifestJson });
        setActive(input.stateId, version);
        prune(input.name, version);
        return { snapshot: true, issue: null };
      }

      // 能力包升级会重建 skills_state 行：同版本同 checksum 复用既有快照目录
      const reusable = repo.findByNameVersionChecksum(input.name, version, digest.checksum);
      if (reusable) {
        repo.create({
          skillStateId: input.stateId,
          name: input.name,
          version,
          checksum: digest.checksum,
          manifestJson,
          dirPath: reusable.dir_path,
        });
      } else {
        const dirPath = join(versionsDir, input.stateId, versionDirName(version));
        copySnapshot(input.directoryPath, dirPath);
        repo.create({
          skillStateId: input.stateId,
          name: input.name,
          version,
          checksum: digest.checksum,
          manifestJson,
          dirPath,
        });
      }
      setActive(input.stateId, version);
      prune(input.name, version);
      return { snapshot: true, issue: null };
    },

    list,

    rollback(name, version) {
      const state = stateRepo.getByName(name);
      if (!state) throw ApiError.notFound('技能', name);
      const row = representativeRows(name, state.id).find((item) => item.version === version);
      if (!row || !existsSync(row.dir_path)) {
        throw new ApiError(
          'SKILL_VERSION_MISSING',
          `技能 ${name} 的版本 ${version} 快照不存在，无法回退`,
        );
      }

      const target = join(options.skillsDir, name);
      const staging = join(options.skillsDir, `.rollback-${state.id}-${randomUUID()}`);
      const backup = join(options.skillsDir, `.rollback-backup-${state.id}-${Date.now()}`);
      let movedTarget = false;
      try {
        copySnapshot(row.dir_path, staging);
        if (existsSync(target)) {
          renameSync(target, backup);
          movedTarget = true;
        }
        renameSync(staging, target);
        if (movedTarget) rmSync(backup, { recursive: true, force: true });
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        try {
          if (!existsSync(target) && movedTarget && existsSync(backup)) renameSync(backup, target);
        } catch {
          /* 恢复失败时保留 .bak 目录供人工处理 */
        }
        throw new ApiError(
          'SKILL_ROLLBACK_FAILED',
          `技能 ${name} 回退到 ${version} 失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }

      stateRepo.update(state.id, { activeVersion: version });
      prune(name, version);
      return list(name);
    },
  };
}
