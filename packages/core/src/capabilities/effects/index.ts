import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import type { WorkflowRepository } from '@wbfm/database';
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
  uninstallWorkflow,
  type WorkflowEffectDeps,
} from './workflow';
import {
  disablePetAction,
  enablePetAction,
  type PetActionEffectDeps,
} from './pet-action';

/** v2.11：六类 effect 依赖；当前接入 skill / mcp / workflow / pet-action */
export interface CapabilityEffectDeps {
  skills: SkillService;
  mcp: McpRegistry;
  skillsDir: string;
  workflows: WorkflowRepository;
  motions: MotionService;
}

export type { SkillEffectDeps, McpEffectDeps, WorkflowEffectDeps, PetActionEffectDeps };

function skillDeps(deps: CapabilityEffectDeps): SkillEffectDeps {
  return { skills: deps.skills, skillsDir: deps.skillsDir };
}

function mcpDeps(deps: CapabilityEffectDeps): McpEffectDeps {
  return { mcp: deps.mcp };
}

function workflowDeps(deps: CapabilityEffectDeps): WorkflowEffectDeps {
  return { workflows: deps.workflows };
}

function petActionDeps(deps: CapabilityEffectDeps): PetActionEffectDeps {
  return { motions: deps.motions };
}

export function enableCapabilityEffect(
  manifest: CapabilityManifest,
  packDir: string,
  deps: CapabilityEffectDeps,
): string {
  switch (manifest.kind) {
    case 'skill':
      return enableSkill(packDir, skillDeps(deps));
    case 'mcp':
      return enableMcp(packDir, manifest, mcpDeps(deps));
    case 'workflow':
      return enableWorkflow(manifest, packDir, workflowDeps(deps));
    case 'pet-action':
      return enablePetAction(manifest, packDir, petActionDeps(deps));
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
      return disableSkill(effectRef, skillDeps(deps));
    case 'mcp':
      return disableMcp(effectRef, mcpDeps(deps));
    case 'workflow':
      return disableWorkflow(effectRef, workflowDeps(deps));
    case 'pet-action':
      return disablePetAction(effectRef, petActionDeps(deps));
    default:
      return;
  }
}

/** 卸载补偿：disable 已执行；只有 workflow 需要判定「删行还是保留禁用行」 */
export function uninstallCapabilityEffect(
  manifest: CapabilityManifest,
  effectRef: string | null,
  deps: CapabilityEffectDeps,
): void {
  if (manifest.kind !== 'workflow' || !effectRef) return;
  uninstallWorkflow(effectRef, workflowDeps(deps));
}
