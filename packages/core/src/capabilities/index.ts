/** v2.10 能力包（core barrel） */
export {
  createCapabilityService,
  type CapabilityService,
  type CapabilityServiceDeps,
} from './capability-service';
export {
  buildSampleSkillPack,
  parseCapabilityZip,
  CAPABILITY_MANIFEST_FILE,
  type ParsedCapability,
} from './manifest';
export {
  enableCapabilityEffect,
  disableCapabilityEffect,
  type CapabilityEffectDeps,
} from './capability-effects';
