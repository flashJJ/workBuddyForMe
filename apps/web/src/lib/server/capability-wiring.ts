import {
  createInstalledEventScriptRepository,
  createReportWidgetRepository,
  type WorkflowRepository,
} from '@wbfm/database';
import { createCapabilityService } from '@wbfm/core/capabilities';
import type { McpRegistry } from '@wbfm/core/mcp';
import type { SkillService } from '@wbfm/core/skills';
import { createSettingsService, type MotionService, type ServiceDeps } from '@wbfm/core/services';
import { readSampleMotionAsset } from './capability-sample-asset';

interface CapabilityWiringInput {
  deps: ServiceDeps;
  skills: SkillService;
  mcp: McpRegistry;
  workflows: WorkflowRepository;
  motions: MotionService;
}

/** v2.11：能力包服务装配（剧本/卡片仓储 + 示例素材读取） */
export function createCapabilityServiceForApp(input: CapabilityWiringInput) {
  const { db } = input.deps;
  return createCapabilityService({
    db,
    skills: input.skills,
    mcp: input.mcp,
    workflows: input.workflows,
    motions: input.motions,
    eventScripts: createInstalledEventScriptRepository(db),
    reportWidgets: createReportWidgetRepository(db),
    settings: createSettingsService(input.deps),
    sampleMotionAsset: readSampleMotionAsset,
  });
}
