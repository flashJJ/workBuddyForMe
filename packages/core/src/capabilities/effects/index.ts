import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import type {
  InstalledEventScriptRepository,
  ReportWidgetRepository,
  WorkflowRepository,
} from '@wbfm/database';
import type { SkillService } from '../../skills/skill-service';
import type { MotionService } from '../../services/motion-service';
import type { McpRegistry } from '../../mcp/registry';
import {
  disableMcp,
  disableSkill,
  enableMcp,
  enableSkill,
  type McpEffectDeps,
  type SkillEffectDeps,
} from './skill-mcp';
import {
  disableWorkflow,
  enableWorkflow,
  restoreWorkflowVersion,
  uninstallWorkflow,
  upgradeWorkflow,
  upgradeWorkflowDisabled,
  type WorkflowEffectDeps,
} from './workflow';
import {
  disablePetAction,
  enablePetAction,
  readPetActionEntryKey,
  type PetActionEffectDeps,
} from './pet-action';
import {
  disableEventScript,
  enableEventScript,
  replaceEventScriptDefinition,
  uninstallEventScript,
  type EventScriptEffectDeps,
} from './event-script';
import {
  disableReportWidget,
  enableReportWidget,
  type ReportWidgetEffectDeps,
} from './report-widget';

/** v2.11：六类 effect 依赖 */
export interface CapabilityEffectDeps {
  skills: SkillService;
  mcp: McpRegistry;
  skillsDir: string;
  workflows: WorkflowRepository;
  motions: MotionService;
  eventScripts: InstalledEventScriptRepository;
  reportWidgets: ReportWidgetRepository;
}

export type {
  SkillEffectDeps,
  McpEffectDeps,
  WorkflowEffectDeps,
  PetActionEffectDeps,
  EventScriptEffectDeps,
  ReportWidgetEffectDeps,
};

// v2.12：升级适配与预检读取
export { readMcpServerName, readSkillName } from './skill-mcp';
export {
  restoreWorkflowVersion,
  upgradeWorkflow,
  upgradeWorkflowDisabled,
} from './workflow';
export { readPetActionEntryKey } from './pet-action';
export {
  readEventScriptId,
  replaceEventScriptDefinition,
} from './event-script';

export function enableCapabilityEffect(
  manifest: CapabilityManifest,
  packDir: string,
  deps: CapabilityEffectDeps,
): string {
  switch (manifest.kind) {
    case 'skill':
      return enableSkill(packDir, { skills: deps.skills, skillsDir: deps.skillsDir });
    case 'mcp':
      return enableMcp(packDir, manifest, { mcp: deps.mcp });
    case 'workflow':
      return enableWorkflow(manifest, packDir, { workflows: deps.workflows });
    case 'pet-action':
      return enablePetAction(manifest, packDir, { motions: deps.motions });
    case 'event-script':
      return enableEventScript(manifest, packDir, { eventScripts: deps.eventScripts });
    case 'report-widget':
      return enableReportWidget(manifest, packDir, { reportWidgets: deps.reportWidgets });
    default:
      throw ApiError.validation(`该能力类型尚未接入：${manifest.kind}`);
  }
}

export function disableCapabilityEffect(
  manifest: CapabilityManifest,
  effectRef: string,
  deps: CapabilityEffectDeps,
): void {
  switch (manifest.kind) {
    case 'skill':
      return disableSkill(effectRef, { skills: deps.skills, skillsDir: deps.skillsDir });
    case 'mcp':
      return disableMcp(effectRef, { mcp: deps.mcp });
    case 'workflow':
      return disableWorkflow(effectRef, { workflows: deps.workflows });
    case 'pet-action':
      return disablePetAction(effectRef, { motions: deps.motions });
    case 'event-script':
      return disableEventScript(effectRef, { eventScripts: deps.eventScripts });
    case 'report-widget':
      return disableReportWidget(effectRef, { reportWidgets: deps.reportWidgets });
    default:
      return;
  }
}

/** 卸载补偿：disable 已执行；workflow 判定删行或保留禁用行，剧本/卡片清行 */
export function uninstallCapabilityEffect(
  manifest: CapabilityManifest,
  effectRef: string | null,
  deps: CapabilityEffectDeps,
): void {
  if (!effectRef) return;
  if (manifest.kind === 'workflow') {
    uninstallWorkflow(effectRef, { workflows: deps.workflows });
    return;
  }
  if (manifest.kind === 'event-script') {
    uninstallEventScript(effectRef, { eventScripts: deps.eventScripts });
  }
}
