/** v2.17 能力目录（子域 barrel）：内置精选目录 + 检索/安装代理 */
export { BUNDLED_CAPABILITY_CATALOG } from './data';
export { createCapabilityCatalog } from './service';
export type {
  CapabilityCatalog,
  CapabilityCatalogDeps,
  CapabilityCatalogInstallResult,
  CapabilityCatalogSearchInput,
  CapabilityCatalogSearchItem,
  CapabilityInstallTarget,
} from './types';
