import type {
  CapabilityManifest,
  CapabilityStatus,
  CapabilityView,
} from '@wbfm/shared/schemas';
import type { CapabilityRepository } from '@wbfm/database';
import type { CapabilityEffectDeps } from './effects';

/** v2.12 M2：升级编排的公共类型与版本比较（不依赖文件系统，便于单测） */

export interface CapabilityUpgradeHooks {
  assertSignature(manifest: CapabilityManifest): void;
  annotate(view: CapabilityView, manifest: CapabilityManifest): CapabilityView;
}

export interface CapabilityUpgradeInput {
  id: string;
  buffer: Uint8Array;
  repo: CapabilityRepository;
  effects: CapabilityEffectDeps;
  rootDir: string;
  hooks: CapabilityUpgradeHooks;
  /** v2.14：降级必须显式确认，且 expectedVersion 必须等于包内版本 */
  confirmDowngrade?: boolean;
  expectedVersion?: string;
  /** v2.14：同版本内容变化时显式修复安装 */
  repair?: boolean;
}

export type CapabilityUpgradeDirection = 'upgrade' | 'downgrade' | 'repair';

export interface CapabilityUpgradeResult {
  capability: CapabilityView;
  upgrade: {
    from: string;
    to: string;
    direction: CapabilityUpgradeDirection;
    affectedDisabledDependents: string[];
  };
}

export interface UpgradeSnapshot {
  manifest: CapabilityManifest;
  status: CapabilityStatus;
  effectRef: string | null;
  workflowId?: string;
  workflowVersion?: number;
  script?: { id: string; name: string; definitionJson: string; enabled: boolean };
}

/** 严格三段版本比较；非法格式返回 null（调用方转 422） */
export function compareCapabilityVersions(next: string, current: string): number | null {
  const parse = (value: string): number[] | null => {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+){0,2}$/.test(trimmed)) return null;
    const parts = trimmed.split('.').map((item) => Number(item));
    while (parts.length < 3) parts.push(0);
    return parts;
  };
  const a = parse(next);
  const b = parse(current);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index]! > b[index]! ? 1 : -1;
  }
  return 0;
}

export function upgradeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
