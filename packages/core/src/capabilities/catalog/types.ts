import type {
  CapabilityCatalogEntry,
  CapabilityKind,
  CapabilityStatus,
  CapabilityView,
} from '@wbfm/shared/schemas';

/** v2.30：已安装能力 + 目录条目快照（供 capability_list 与审批详情共用） */
export interface CapabilityInventoryItem {
  id: string;
  name: string;
  kind: CapabilityKind;
  version: string;
  status: CapabilityStatus;
  permissions: CapabilityView['permissions'];
  effects: string[];
  toolNames: string[];
  source: CapabilityCatalogEntry['source'] | 'local';
  installStrategy: CapabilityCatalogEntry['installStrategy'] | 'manual';
  signatureStatus?: CapabilityView['signatureStatus'];
  installedAt: string;
}

/**
 * v2.17 M4：能力目录类型（仅依赖 shared，避免目录服务与能力服务形成反向导入环）。
 * CapabilityService 在结构上满足 CapabilityInstallTarget。
 */

export interface CapabilityCatalogSearchInput {
  query: string;
  kind?: CapabilityKind;
}

export interface CapabilityCatalogSearchItem extends CapabilityCatalogEntry {
  installed: boolean;
  status: CapabilityStatus | null;
}

export interface CapabilityCatalogInstallResult {
  entry: CapabilityCatalogEntry;
  capability: CapabilityView;
}

/** 目录安装所需的最小能力服务接口（list / install / sample） */
export interface CapabilityInstallTarget {
  list(): CapabilityView[];
  install(buffer: Uint8Array): CapabilityView;
  sample(kind?: CapabilityKind): Uint8Array;
}

export interface CapabilityCatalogDeps {
  capabilities: CapabilityInstallTarget;
  /** 测试注入：目录常量（默认内置精选包） */
  entries?: readonly CapabilityCatalogEntry[];
}

export interface CapabilityCatalog {
  search(input: CapabilityCatalogSearchInput): CapabilityCatalogSearchItem[];
  install(id: string): CapabilityCatalogInstallResult;
  /** v2.30：已安装能力视图（含目录 effects/toolNames）；目录缺失时字段为空数组 */
  listInstalled(): CapabilityInventoryItem[];
}
