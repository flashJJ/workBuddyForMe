import {
  createInstalledEventScriptRepository,
  createReportWidgetRepository,
  type DatabaseInstance,
  type WorkflowRepository,
} from '@wbfm/database';
import { createCapabilityService } from '@wbfm/core/capabilities';
import type { McpRegistry } from '@wbfm/core/mcp';
import type { SkillService } from '@wbfm/core/skills';
import type { MotionService } from '@wbfm/core/services';
import { readSampleMotionAsset } from './capability-sample-asset';

interface CapabilityWiringInput {
  db: DatabaseInstance;
  skills: SkillService;
  mcp: McpRegistry;
  workflows: WorkflowRepository;
  motions: MotionService;
}

/** v2.11：能力包服务装配（剧本/卡片仓储 + 示例素材读取） */
export function createCapabilityServiceForApp(input: CapabilityWiringInput) {
  return createCapabilityService({
    ...input,
    eventScripts: createInstalledEventScriptRepository(input.db),
    reportWidgets: createReportWidgetRepository(input.db),
    sampleMotionAsset: readSampleMotionAsset,
  });
}
