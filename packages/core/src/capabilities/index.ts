/** v2.10 能力包（core barrel） */
export {
  createCapabilityService,
  type CapabilityService,
  type CapabilityServiceDeps,
} from './capability-service';
export {
  compareCapabilityVersions,
  upgradeCapability,
  type CapabilityUpgradeInput,
  type CapabilityUpgradeResult,
} from './upgrade';
export {
  cleanupCapabilityArtifacts,
  scanCapabilitiesHealth,
  type HealthScanInput,
} from './health';
export {
  BUNDLED_CAPABILITY_CATALOG,
  createCapabilityCatalog,
  type CapabilityCatalog,
  type CapabilityCatalogDeps,
  type CapabilityCatalogInstallResult,
  type CapabilityCatalogSearchInput,
  type CapabilityCatalogSearchItem,
} from './catalog/index';
export {
  buildSamplePack,
  buildSampleSkillPack,
} from './samples';
export {
  parseCapabilityZip,
  CAPABILITY_MANIFEST_FILE,
  type ParsedCapability,
} from './manifest';
export {
  enableCapabilityEffect,
  disableCapabilityEffect,
  uninstallCapabilityEffect,
  type CapabilityEffectDeps,
} from './effects/index';
