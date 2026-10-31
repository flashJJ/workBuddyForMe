import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityManifest, CapabilityView } from '@wbfm/shared/schemas';
import type { CapabilityRepository } from '@wbfm/database';
import { parseCapabilityZip } from './manifest';
import {
  disableCapabilityEffect,
  enableCapabilityEffect,
  replaceEventScriptDefinition,
  restoreWorkflowVersion,
  upgradeWorkflow,
  upgradeWorkflowDisabled,
  type CapabilityEffectDeps,
} from './effects';
import {
  affectedDependents,
  assertDependencies,
  assertResourcePreflight,
  buildUpgradeSnapshot,
  cleanupDirs,
  writeStaging,
} from './upgrade-preflight';
import { assertUpgradeDirection } from './upgrade-direction';
import {
  upgradeErrorMessage,
  type CapabilityUpgradeDirection,
  type CapabilityUpgradeInput,
  type CapabilityUpgradeResult,
  type UpgradeSnapshot,
} from './upgrade-types';

export type {
  CapabilityUpgradeDirection,
  CapabilityUpgradeHooks,
  CapabilityUpgradeInput,
  CapabilityUpgradeResult,
} from './upgrade-types';
export { compareCapabilityVersions } from './upgrade-types';

/**
 * v2.12 M2：同 id 原地升级（预检 → 暂存 → 原子换目录 → 按 kind 适配 → 失败回滚）。
 * 不新增表：升级只改 capability_packs 行内字段与既有资源对象。
 */

/** 进程内单 id 互斥：同一能力包不允许并发升级 */
const IN_FLIGHT = new Set<string>();

/** 升级/回滚：按 kind 恢复旧 effect；返回恢复后的句柄（无句柄返回 null） */
function restoreOldEffect(
  snapshot: UpgradeSnapshot,
  packDir: string,
  effects: CapabilityEffectDeps,
): string | null {
  const { manifest, workflowId, workflowVersion, script } = snapshot;
  if (manifest.kind === 'workflow' && workflowId && workflowVersion !== undefined) {
    restoreWorkflowVersion(workflowId, workflowVersion, snapshot.status === 'enabled', {
      workflows: effects.workflows,
    });
    return snapshot.status === 'enabled' ? workflowId : null;
  }
  if (manifest.kind === 'event-script' && script) {
    replaceEventScriptDefinition(manifest, packDir, script.id, script.enabled, {
      eventScripts: effects.eventScripts,
    });
    return snapshot.status === 'enabled' ? script.id : null;
  }
  if (snapshot.status !== 'enabled') return null;
  return enableCapabilityEffect(manifest, packDir, effects);
}

/** 旧包启用中时的升级动作；返回新句柄 */
function applyUpgrade(
  manifest: CapabilityManifest,
  packDir: string,
  snapshot: UpgradeSnapshot,
  effects: CapabilityEffectDeps,
): string {
  if (manifest.kind === 'workflow' && snapshot.workflowId) {
    return upgradeWorkflow(manifest, packDir, snapshot.workflowId, {
      workflows: effects.workflows,
    });
  }
  if (manifest.kind === 'event-script' && snapshot.script) {
    return replaceEventScriptDefinition(manifest, packDir, snapshot.script.id, true, {
      eventScripts: effects.eventScripts,
    });
  }
  return enableCapabilityEffect(manifest, packDir, effects);
}

/** 旧包禁用时的升级动作：内容层更新，不启用 */
function applyUpgradeDisabled(
  manifest: CapabilityManifest,
  packDir: string,
  snapshot: UpgradeSnapshot,
  effects: CapabilityEffectDeps,
): void {
  if (manifest.kind === 'workflow' && snapshot.workflowId) {
    upgradeWorkflowDisabled(manifest, packDir, snapshot.workflowId, {
      workflows: effects.workflows,
    });
  }
  if (manifest.kind === 'event-script' && snapshot.script) {
    replaceEventScriptDefinition(manifest, packDir, snapshot.script.id, false, {
      eventScripts: effects.eventScripts,
    });
  }
}

function recoverAfterAbort(
  id: string,
  snapshot: UpgradeSnapshot,
  liveDir: string,
  repo: CapabilityRepository,
  effects: CapabilityEffectDeps,
): void {
  if (snapshot.status !== 'enabled') return;
  try {
    const ref = restoreOldEffect(snapshot, liveDir, effects);
    if (ref) repo.update(id, { status: 'enabled', effectRef: ref, lastError: null });
  } catch (error) {
    repo.update(id, { status: 'disabled', effectRef: null, lastError: upgradeErrorMessage(error) });
  }
}

function rollback(
  id: string,
  snapshot: UpgradeSnapshot,
  liveDir: string,
  backupDir: string,
  repo: CapabilityRepository,
  effects: CapabilityEffectDeps,
  stagingDir: string,
  cause: unknown,
): never {
  rmSync(liveDir, { recursive: true, force: true });
  if (existsSync(backupDir)) renameSync(backupDir, liveDir);
  cleanupDirs(stagingDir, backupDir);
  repo.replaceManifest(id, snapshot.manifest);
  let ref: string | null = null;
  try {
    ref = restoreOldEffect(snapshot, liveDir, effects);
  } catch (error) {
    repo.update(id, {
      status: 'disabled',
      effectRef: null,
      lastError: `升级失败且旧版本恢复失败：${upgradeErrorMessage(error)}`,
    });
    throw ApiError.validation(
      `能力包 ${id} 升级失败且旧版本恢复失败：${upgradeErrorMessage(error)}；请重新安装旧版本`,
    );
  }
  if (snapshot.status === 'enabled' && ref) {
    repo.update(id, { status: 'enabled', effectRef: ref, lastError: null });
  }
  throw ApiError.validation(`升级失败，已回滚到旧版本：${upgradeErrorMessage(cause)}`);
}

export function upgradeCapability(input: CapabilityUpgradeInput): CapabilityUpgradeResult {
  const { id, buffer, repo, effects, rootDir, hooks } = input;
  if (IN_FLIGHT.has(id)) throw ApiError.conflict(`升级进行中：${id}`);
  const capability = repo.get(id);
  if (!capability) throw ApiError.notFound('能力包', id);
  const oldManifest = repo.getManifest(id);
  if (!oldManifest) throw ApiError.validation('能力包清单损坏，请重新安装');

  const parsed = parseCapabilityZip(buffer);
  const manifest = parsed.manifest;
  if (manifest.id !== id) throw ApiError.validation(`清单 id 与目标不一致：${manifest.id}`);
  if (manifest.kind !== capability.kind) {
    throw ApiError.validation(`升级不允许修改 kind：${capability.kind} → ${manifest.kind}`);
  }
  const direction: CapabilityUpgradeDirection = assertUpgradeDirection(oldManifest, manifest, {
    currentVersion: capability.version,
    ...input,
  });
  hooks.assertSignature(manifest);
  assertDependencies(repo, manifest);

  const enabledDependents = affectedDependents(repo, id, manifest.version, 'enabled');
  if (enabledDependents.length > 0) {
    throw new ApiError(
      'CAPABILITY_DEPENDENTS_ACTIVE',
      `启用中的能力包仍声明旧版本：${enabledDependents.join(', ')}`,
      { dependents: enabledDependents },
    );
  }
  const disabledDependents = affectedDependents(repo, id, manifest.version, 'disabled');

  const snapshot = buildUpgradeSnapshot(id, capability, oldManifest, effects);
  const nonce = `${id}-${randomUUID()}`;
  const stagingDir = join(rootDir, '.staging', nonce);
  const backupDir = join(rootDir, '.backup', nonce);
  const liveDir = join(rootDir, id);
  if (!existsSync(liveDir)) throw ApiError.validation('能力包文件缺失，请重新安装');

  writeStaging(parsed.files, stagingDir);
  try {
    assertResourcePreflight(manifest, stagingDir, snapshot, effects);
  } catch (error) {
    cleanupDirs(stagingDir);
    throw error;
  }

  IN_FLIGHT.add(id);
  try {
    if (snapshot.status === 'enabled') {
      try {
        disableCapabilityEffect(oldManifest, snapshot.effectRef!, effects);
      } catch (error) {
        cleanupDirs(stagingDir);
        throw ApiError.validation(`升级失败：停用旧版本失败 ${upgradeErrorMessage(error)}`);
      }
    }
    try {
      mkdirSync(dirname(backupDir), { recursive: true });
      renameSync(liveDir, backupDir);
      renameSync(stagingDir, liveDir);
    } catch (error) {
      cleanupDirs(stagingDir);
      if (!existsSync(liveDir) && existsSync(backupDir)) renameSync(backupDir, liveDir);
      recoverAfterAbort(id, snapshot, liveDir, repo, effects);
      throw ApiError.validation(`升级失败：替换文件失败 ${upgradeErrorMessage(error)}`);
    }

    try {
      const replaced = repo.replaceManifest(id, manifest);
      if (!replaced) throw ApiError.validation('能力包记录丢失，升级中止');
      let view: CapabilityView;
      if (snapshot.status === 'enabled') {
        const ref = applyUpgrade(manifest, liveDir, snapshot, effects);
        view = repo.update(id, { status: 'enabled', effectRef: ref, lastError: null })!;
      } else {
        applyUpgradeDisabled(manifest, liveDir, snapshot, effects);
        view = repo.get(id)!;
      }
      cleanupDirs(stagingDir, backupDir);
      return {
        capability: hooks.annotate(view, manifest),
        upgrade: {
          from: snapshot.manifest.version,
          to: manifest.version,
          direction,
          affectedDisabledDependents: disabledDependents,
        },
      };
    } catch (error) {
      return rollback(id, snapshot, liveDir, backupDir, repo, effects, stagingDir, error);
    }
  } finally {
    IN_FLIGHT.delete(id);
  }
}
