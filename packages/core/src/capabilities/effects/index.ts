import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityKind, CapabilityManifest } from '@wbfm/shared/schemas';
import type {
  InstalledEventScriptRepository,
  ReportWidgetRepository,
  WorkflowRepository,
} from '@wbfm/database';
import type { SkillService } from '../../skills/skill-service';
import type { MotionService } from '../../services/media/motion-service';
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
import { disableMotionPack, enableMotionPack } from './motion-pack';
import { disableScenePack, enableScenePack } from './scene-pack';
import { disablePropPack, enablePropPack } from './prop-pack';
import { disableWallpaperPack, enableWallpaperPack } from './wallpaper-pack';

/** v2.11：能力 effect 依赖；v4.0 七类 */
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

/** v3.1：单类能力的 effect 处理器；新增 kind 只需注册，不再改分发函数 */
export interface CapabilityEffectHandler {
  enable(manifest: CapabilityManifest, packDir: string, deps: CapabilityEffectDeps): string;
  disable(effectRef: string, deps: CapabilityEffectDeps): void;
  /** 卸载补偿（disable 已执行）；无额外清理可省略 */
  uninstall?(effectRef: string, deps: CapabilityEffectDeps): void;
}

const BUILTIN_EFFECT_HANDLERS: Record<CapabilityKind, CapabilityEffectHandler> = {
  skill: {
    enable: (_manifest, packDir, deps) =>
      enableSkill(packDir, { skills: deps.skills, skillsDir: deps.skillsDir }),
    disable: (effectRef, deps) =>
      disableSkill(effectRef, { skills: deps.skills, skillsDir: deps.skillsDir }),
  },
  mcp: {
    enable: (manifest, packDir, deps) => enableMcp(packDir, manifest, { mcp: deps.mcp }),
    disable: (effectRef, deps) => disableMcp(effectRef, { mcp: deps.mcp }),
  },
  workflow: {
    enable: (manifest, packDir, deps) =>
      enableWorkflow(manifest, packDir, { workflows: deps.workflows }),
    disable: (effectRef, deps) => disableWorkflow(effectRef, { workflows: deps.workflows }),
    uninstall: (effectRef, deps) => uninstallWorkflow(effectRef, { workflows: deps.workflows }),
  },
  'pet-action': {
    enable: (manifest, packDir, deps) =>
      enablePetAction(manifest, packDir, { motions: deps.motions }),
    disable: (effectRef, deps) => disablePetAction(effectRef, { motions: deps.motions }),
  },
  'event-script': {
    enable: (manifest, packDir, deps) =>
      enableEventScript(manifest, packDir, { eventScripts: deps.eventScripts }),
    disable: (effectRef, deps) => disableEventScript(effectRef, { eventScripts: deps.eventScripts }),
    uninstall: (effectRef, deps) =>
      uninstallEventScript(effectRef, { eventScripts: deps.eventScripts }),
  },
  'report-widget': {
    enable: (manifest, packDir, deps) =>
      enableReportWidget(manifest, packDir, { reportWidgets: deps.reportWidgets }),
    disable: (effectRef, deps) =>
      disableReportWidget(effectRef, { reportWidgets: deps.reportWidgets }),
  },
  'motion-pack': {
    enable: (manifest, packDir) => enableMotionPack(manifest, packDir),
    disable: () => disableMotionPack(),
  },
  'scene-pack': {
    enable: (manifest, packDir) => enableScenePack(manifest, packDir),
    disable: () => disableScenePack(),
  },
  'prop-pack': {
    enable: (manifest, packDir) => enablePropPack(manifest, packDir),
    disable: () => disablePropPack(),
  },
  'wallpaper-pack': {
    enable: (manifest, packDir) => enableWallpaperPack(manifest, packDir),
    disable: () => disableWallpaperPack(),
  },
};

const EFFECT_HANDLERS = new Map<CapabilityKind, CapabilityEffectHandler>(
  Object.entries(BUILTIN_EFFECT_HANDLERS) as [CapabilityKind, CapabilityEffectHandler][],
);

/** v3.1：注册新 kind 的 effect 处理器；内置 kind 不允许覆盖 */
export function registerCapabilityEffectHandler(
  kind: CapabilityKind,
  handler: CapabilityEffectHandler,
): void {
  if (EFFECT_HANDLERS.has(kind)) throw ApiError.conflict(`能力类型已注册：${kind}`);
  EFFECT_HANDLERS.set(kind, handler);
}

export function enableCapabilityEffect(
  manifest: CapabilityManifest,
  packDir: string,
  deps: CapabilityEffectDeps,
): string {
  const handler = EFFECT_HANDLERS.get(manifest.kind);
  if (!handler) throw ApiError.validation(`该能力类型尚未接入：${manifest.kind}`);
  return handler.enable(manifest, packDir, deps);
}

export function disableCapabilityEffect(
  manifest: CapabilityManifest,
  effectRef: string,
  deps: CapabilityEffectDeps,
): void {
  EFFECT_HANDLERS.get(manifest.kind)?.disable(effectRef, deps);
}

/** 卸载补偿：disable 已执行；workflow 判定删行或保留禁用行，剧本/卡片清行 */
export function uninstallCapabilityEffect(
  manifest: CapabilityManifest,
  effectRef: string | null,
  deps: CapabilityEffectDeps,
): void {
  if (!effectRef) return;
  EFFECT_HANDLERS.get(manifest.kind)?.uninstall?.(effectRef, deps);
}
