import { ApiError } from '@wbfm/shared/errors';
import { APP_VERSION } from '@wbfm/shared/version';
import type {
  CapabilityHealthIssue,
  CapabilityManifest,
  CapabilityView,
} from '@wbfm/shared/schemas';
import type { CapabilityRepository } from '@wbfm/database';
import { compareCapabilityVersions } from '../upgrade-types';

/**
 * v4.0 M1：能力依赖图。
 *
 * 只处理“能力包 id 依赖”，不引入服务标识；缺依赖仍由安装/启用预检报错，
 * 这里负责环检测、依赖优先顺序与健康报告。
 */

export interface DependencyNode {
  id: string;
  dependencies: ReadonlyArray<{ id: string; version?: string }>;
}

function nodeOf(manifest: CapabilityManifest): DependencyNode {
  return { id: manifest.id, dependencies: manifest.dependencies };
}

/** 已安装清单（可选用 incoming 替换同 id 节点），忽略读不出的坏清单 */
export function installedDependencyNodes(
  repo: CapabilityRepository,
  incoming?: CapabilityManifest,
): DependencyNode[] {
  const nodes = repo
    .list()
    .map((item) => repo.getManifest(item.id))
    .filter((manifest): manifest is CapabilityManifest => Boolean(manifest))
    .map(nodeOf);
  if (!incoming) return nodes;
  return [...nodes.filter((node) => node.id !== incoming.id), nodeOf(incoming)];
}

/** 返回环路径（首尾同 id）；无环返回 null。只沿集合内存在的依赖边走 */
export function findDependencyCycle(nodes: readonly DependencyNode[]): string[] | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const status = state.get(id) ?? 0;
    if (status === 1) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (status === 2) return null;
    state.set(id, 1);
    stack.push(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) {
      if (!byId.has(dependency.id)) continue;
      const cycle = visit(dependency.id);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };

  for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }
  return null;
}

/** 依赖优先顺序：被依赖者在前；同层按 id 排序，结果稳定 */
export function dependencyOrder(nodes: readonly DependencyNode[]): string[] {
  const cycle = findDependencyCycle(nodes);
  if (cycle) throw ApiError.validation(`能力依赖存在环：${cycle.join(' -> ')}`);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      if (!byId.has(dependency.id)) continue;
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      const list = dependents.get(dependency.id) ?? [];
      list.push(node.id);
      dependents.set(dependency.id, list);
    }
  }

  const ready = nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 1) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  return order;
}

/** 安装/启用/升级前：存在环则拒绝 */
export function assertAcyclicDependencies(nodes: readonly DependencyNode[]): void {
  const cycle = findDependencyCycle(nodes);
  if (cycle) throw ApiError.validation(`能力依赖存在环：${cycle.join(' -> ')}`);
}

/** coreVersion 表示最低应用版本；缺省不校验 */
export function assertCoreVersion(
  manifest: CapabilityManifest,
  currentVersion = APP_VERSION,
): void {
  if (!manifest.coreVersion) return;
  const comparison = compareCapabilityVersions(currentVersion, manifest.coreVersion);
  if (comparison === null) {
    throw ApiError.validation(`coreVersion 格式非法：${manifest.coreVersion}`);
  }
  if (comparison < 0) {
    throw ApiError.validation(
      `能力包需要应用版本 ≥ ${manifest.coreVersion}，当前 ${currentVersion}`,
    );
  }
}

/** 健康报告：缺失、禁用、版本不匹配与环 */
export function dependencyIssues(
  manifest: CapabilityManifest,
  installed: CapabilityView[],
  cycle: string[] | null = null,
): CapabilityHealthIssue[] {
  const issues: CapabilityHealthIssue[] = [];
  if (cycle?.includes(manifest.id)) {
    issues.push({
      code: 'dependency_cycle',
      severity: 'error',
      message: `能力依赖存在环：${cycle.join(' -> ')}`,
      detail: manifest.id,
    });
  }
  for (const dependency of manifest.dependencies) {
    const hit = installed.find((item) => item.id === dependency.id);
    if (!hit) {
      issues.push({
        code: 'dependency_missing',
        severity: 'error',
        message: `依赖未安装：${dependency.id}`,
        detail: dependency.id,
      });
      continue;
    }
    if (hit.status !== 'enabled') {
      issues.push({
        code: 'dependency_disabled',
        severity: 'warn',
        message: `依赖未启用：${dependency.id}`,
        detail: dependency.id,
      });
    }
    if (dependency.version && hit.version !== dependency.version) {
      issues.push({
        code: 'dependency_version_mismatch',
        severity: 'error',
        message: `依赖版本不匹配：${dependency.id} 需要 ${dependency.version}，已安装 ${hit.version}`,
        detail: dependency.id,
      });
    }
  }
  return issues;
}
