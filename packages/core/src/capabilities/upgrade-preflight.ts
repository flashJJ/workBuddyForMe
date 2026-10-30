import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityManifest, CapabilityStatus, CapabilityView } from '@wbfm/shared/schemas';
import type { CapabilityRepository } from '@wbfm/database';
import {
  readEventScriptId,
  readMcpServerName,
  readPetActionEntryKey,
  readSkillName,
  type CapabilityEffectDeps,
} from './effects';
import type { UpgradeSnapshot } from './upgrade-types';

/** v2.12 M2：升级预检（依赖、从属、资源冲突、快照）与暂存目录写入 */

export function affectedDependents(
  repo: CapabilityRepository,
  id: string,
  version: string,
  status: CapabilityStatus,
): string[] {
  return repo
    .list()
    .filter((item) => item.id !== id && item.status === status)
    .filter((item) => {
      const manifest = repo.getManifest(item.id);
      return manifest?.dependencies.some(
        (dep) => dep.id === id && dep.version !== undefined && dep.version !== version,
      );
    })
    .map((item) => item.id);
}

export function assertDependencies(repo: CapabilityRepository, manifest: CapabilityManifest): void {
  const installed = repo.list();
  for (const dependency of manifest.dependencies) {
    const hit = installed.find((item) => item.id === dependency.id);
    if (!hit) throw ApiError.validation(`依赖未安装：${dependency.id}`);
    if (hit.status !== 'enabled') throw ApiError.validation(`依赖未启用：${dependency.id}`);
    if (dependency.version && hit.version !== dependency.version) {
      throw ApiError.validation(
        `依赖版本不匹配：${dependency.id} 需要 ${dependency.version}，已安装 ${hit.version}`,
      );
    }
  }
}

export function buildUpgradeSnapshot(
  id: string,
  capability: CapabilityView,
  oldManifest: CapabilityManifest,
  effects: CapabilityEffectDeps,
): UpgradeSnapshot {
  const snapshot: UpgradeSnapshot = {
    manifest: oldManifest,
    status: capability.status,
    effectRef: capability.effectRef,
  };
  if (oldManifest.kind === 'workflow') {
    const workflow = capability.effectRef
      ? effects.workflows.getWorkflow(capability.effectRef)
      : effects.workflows.findByOriginCapabilityId(id);
    if (!workflow) throw ApiError.validation('工作流对象缺失，无法升级');
    snapshot.workflowId = workflow.id;
    snapshot.workflowVersion = workflow.currentVersion;
  }
  if (oldManifest.kind === 'event-script') {
    const script = capability.effectRef
      ? effects.eventScripts.get(capability.effectRef)
      : effects.eventScripts.getByPackId(id);
    if (!script) throw ApiError.notFound('剧本', capability.effectRef ?? id);
    snapshot.script = {
      id: script.id,
      name: script.name,
      definitionJson: script.definitionJson,
      enabled: script.enabled,
    };
  }
  return snapshot;
}

/** 新资源句柄/名称冲突预检：必须排除旧 effectRef 自身 */
export function assertResourcePreflight(
  manifest: CapabilityManifest,
  stagingDir: string,
  snapshot: UpgradeSnapshot,
  effects: CapabilityEffectDeps,
): void {
  const oldRef = snapshot.effectRef;
  if (manifest.kind === 'skill') {
    const name = readSkillName(stagingDir);
    if (effects.skills.list().some((item) => item.name === name && item.name !== oldRef)) {
      throw ApiError.conflict(`技能目录已存在：${name}`);
    }
  }
  if (manifest.kind === 'mcp') {
    const name = readMcpServerName(stagingDir, manifest);
    if (effects.mcp.getServerInfos().some((item) => item.name === name && item.id !== oldRef)) {
      throw ApiError.conflict(`MCP 服务器名称已存在：${name}`);
    }
  }
  if (manifest.kind === 'pet-action') {
    const entryKey = readPetActionEntryKey(stagingDir);
    if (
      entryKey &&
      effects.motions.list().some((item) => item.entryKey === entryKey && item.id !== oldRef)
    ) {
      throw ApiError.conflict(`动作条目已存在：${entryKey}`);
    }
  }
  if (manifest.kind === 'event-script' && snapshot.script) {
    const nextId = readEventScriptId(stagingDir);
    if (nextId !== snapshot.script.id) {
      throw ApiError.validation(`升级不允许修改剧本 id：${snapshot.script.id} → ${nextId}`);
    }
  }
}

export function writeStaging(files: Record<string, Uint8Array>, dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const [path, bytes] of Object.entries(files)) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
}

export function cleanupDirs(...dirs: string[]): void {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}
