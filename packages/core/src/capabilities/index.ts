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
} from './effects';
