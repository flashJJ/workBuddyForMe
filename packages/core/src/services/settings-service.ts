import { ApiError } from '@wbfm/shared/errors';
import { type AppSettings } from '@wbfm/shared/types';
import {
  interactionGraphEntrySchema,
  INTERACTION_GRAPH_OVERRIDES_MAX,
  isBuiltinEntryId,
  SUBAGENT_CLI_ARG_MAX,
  SUBAGENT_CLI_ARGS_MAX,
  SUBAGENT_CLI_OUTPUT_DEFAULT_BYTES,
  SUBAGENT_CLI_OUTPUT_MAX_BYTES,
  SUBAGENT_CLI_OUTPUT_MIN_BYTES,
  SUBAGENT_CLI_TIMEOUT_DEFAULT_MS,
  SUBAGENT_CLI_TIMEOUT_MAX_MS,
  SUBAGENT_CLI_TIMEOUT_MIN_MS,
  type InteractionGraphOverride,
  type SettingsUpdateInput,
} from '@wbfm/shared/schemas';
import {
  createModelRepository,
  createSettingsRepository,
} from '@wbfm/database';
import type { ServiceDeps } from './deps';
import { disableDemoMode, enableDemoMode } from './demo-provider';
import { recordMilestone } from './milestones';
import {
  CONTEXT_MESSAGES_MAX,
  CONTEXT_MESSAGES_MIN,
  DEFAULT_CONTEXT_MESSAGES,
} from '@wbfm/shared/constants';

const SETTINGS_KEY = 'app-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  defaultChatModelId: null,
  defaultEmbeddingModelId: null,
  theme: 'light',
  // v1.8：品牌默认主题（亮/暗仍由 theme 三态决定）
  themeId: 'stellar',
  language: 'zh-CN',
  // 全新装机默认未引导；老用户由 v016 迁移显式回填 true
  hasOnboarded: false,
  // v1.3 M4：自动编译默认开；LLM 增强默认关（规则通道零模型调用）
  autoCompile: true,
  compileWithLlm: false,
  compileModelId: null,
  // v1.8 M3：上下文条数（2–50）与全局追加提示词默认
  contextMessageCount: DEFAULT_CONTEXT_MESSAGES,
  globalAppendPrompt: '',
  globalAppendPromptEnabled: false,
  // v2.4 M1：演示模式默认关（用户可一键开启；开启即内置 demo 供应商与 mock 模型）
  demoModeEnabled: false,
  // v2.4 M1 T7：TTFV 里程碑缺省为空（首次启动/模型就绪/首答时由 recordMilestone 首写）
  firstLaunchAt: null,
  firstModelReadyAt: null,
  firstAnswerAt: null,
  ttfvMs: null,
  // v2.7：桌宠工作汇报默认全开、气泡自动、标准节奏
  workSignalEnabled: true,
  workBubbleMode: 'auto',
  workSoundDone: true,
  workSoundError: true,
  workSoundApproval: true,
  workReduceMotion: false,
  workIdlePacing: 'standard',
  // v2.11：外部代理默认关；命令空 = 未配置（注册表保持空）
  subagentCliEnabled: false,
  subagentCliCommand: '',
  subagentCliArgs: [],
  subagentCliTimeoutMs: SUBAGENT_CLI_TIMEOUT_DEFAULT_MS,
  subagentCliMaxOutputBytes: SUBAGENT_CLI_OUTPUT_DEFAULT_BYTES,
};

/** 服务端钳制上下文条数：settings_kv 可被手改/旧值污染，越界一律回落默认 */
export function resolveContextMessageCount(value: number | undefined | null): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= CONTEXT_MESSAGES_MIN &&
    value <= CONTEXT_MESSAGES_MAX
    ? value
    : DEFAULT_CONTEXT_MESSAGES;
}

/** 全局追加仅在开关开且内容非空白时生效 */
export function resolveGlobalAppendPrompt(settings: AppSettings): string | null {
  if (settings.globalAppendPromptEnabled !== true) return null;
  const text = settings.globalAppendPrompt?.trim();
  return text ? text : null;
}

/**
 * 服务端钳制交互动画图覆盖：settings_kv 可被手改，逐条校验（触发键 / 动作条目 id / 条件），
 * 非法条目直接丢弃（不影响其余条目），并截断到上限。
 */
export function resolveInteractionGraphOverrides(value: unknown): InteractionGraphOverride[] {
  if (!Array.isArray(value)) return [];
  const out: InteractionGraphOverride[] = [];
  for (const item of value) {
    const parsed = interactionGraphEntrySchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= INTERACTION_GRAPH_OVERRIDES_MAX) break;
  }
  return out;
}

/**
 * 服务端钳制「停用内置条目」列表：未知 id（内置条目被移除 / 手改 settings_kv）丢弃并去重。
 */
export function resolveInteractionGraphDisabledEntryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !isBuiltinEntryId(item) || out.includes(item)) continue;
    out.push(item);
    if (out.length >= INTERACTION_GRAPH_OVERRIDES_MAX) break;
  }
  return out;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** v2.11：外部代理参数（手改 settings_kv 时截断越界项，不让脏值进入 spawn） */
export function resolveSubagentCliArgs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.slice(0, SUBAGENT_CLI_ARG_MAX))
    .slice(0, SUBAGENT_CLI_ARGS_MAX);
}

export function resolveSubagentCliTimeoutMs(value: unknown): number {
  return clampInt(
    value,
    SUBAGENT_CLI_TIMEOUT_MIN_MS,
    SUBAGENT_CLI_TIMEOUT_MAX_MS,
    SUBAGENT_CLI_TIMEOUT_DEFAULT_MS,
  );
}

export function resolveSubagentCliMaxOutputBytes(value: unknown): number {
  return clampInt(
    value,
    SUBAGENT_CLI_OUTPUT_MIN_BYTES,
    SUBAGENT_CLI_OUTPUT_MAX_BYTES,
    SUBAGENT_CLI_OUTPUT_DEFAULT_BYTES,
  );
}

export function createSettingsService({ db }: ServiceDeps) {
  const settings = createSettingsRepository(db);
  const models = createModelRepository(db);

  const ensureModelExists = (id: string | null, label: string) => {
    if (id !== null && !models.findById(id)) {
      throw ApiError.validation(`${label}不存在：${id}`);
    }
  };

  return {
    get(): AppSettings {
      const merged = { ...DEFAULT_SETTINGS, ...settings.getJson(SETTINGS_KEY, {}) };
      // 服务端钳制为准：手改 settings_kv 的越界条数不进对话管线
      merged.contextMessageCount = resolveContextMessageCount(merged.contextMessageCount);
      merged.interactionGraphOverrides = resolveInteractionGraphOverrides(
        merged.interactionGraphOverrides,
      );
      merged.interactionGraphDisabledEntryIds = resolveInteractionGraphDisabledEntryIds(
        merged.interactionGraphDisabledEntryIds,
      );
      merged.subagentCliEnabled = merged.subagentCliEnabled === true;
      merged.subagentCliCommand = (merged.subagentCliCommand ?? '').trim();
      merged.subagentCliArgs = resolveSubagentCliArgs(merged.subagentCliArgs);
      merged.subagentCliTimeoutMs = resolveSubagentCliTimeoutMs(merged.subagentCliTimeoutMs);
      merged.subagentCliMaxOutputBytes = resolveSubagentCliMaxOutputBytes(
        merged.subagentCliMaxOutputBytes,
      );
      return merged;
    },

    /** v2.4 M1 T7：进入应用即记录首次启动时间（首写优先；供 TTFV 计算） */
    markFirstLaunch(): void {
      recordMilestone(db, 'firstLaunchAt');
    },

    update(patch: SettingsUpdateInput): AppSettings {
      const current = this.get();
      const effective: SettingsUpdateInput = { ...patch };
      let demoJustEnabled = false;

      // v2.4 M1：演示模式开关与内置 demo 供应商/模型联动
      if (patch.demoModeEnabled === true && current.demoModeEnabled !== true) {
        const demo = enableDemoMode(db);
        demoJustEnabled = true;
        if (effective.defaultChatModelId === undefined) effective.defaultChatModelId = demo.chatModelId;
        if (effective.defaultEmbeddingModelId === undefined) {
          effective.defaultEmbeddingModelId = demo.embedModelId;
        }
      } else if (patch.demoModeEnabled === false && current.demoModeEnabled === true) {
        const removed = disableDemoMode(db);
        // 默认模型指向被删的 demo 模型时清空，避免悬空引用（关闭即无残留）
        if (effective.defaultChatModelId === undefined && current.defaultChatModelId === removed.chatModelId) {
          effective.defaultChatModelId = null;
        }
        if (
          effective.defaultEmbeddingModelId === undefined &&
          current.defaultEmbeddingModelId === removed.embedModelId
        ) {
          effective.defaultEmbeddingModelId = null;
        }
      }

      ensureModelExists(effective.defaultChatModelId ?? null, '默认对话模型');
      ensureModelExists(effective.defaultEmbeddingModelId ?? null, '默认嵌入模型');
      ensureModelExists(effective.compileModelId ?? null, '编译增强模型');
      const next = { ...current, ...effective };
      settings.setJson(SETTINGS_KEY, next);
      // v2.4 M1 T7：里程碑必须在本次 setJson 之后记录，否则会被上面这行覆盖
      if (demoJustEnabled) {
        recordMilestone(db, 'firstModelReadyAt');
        return this.get();
      }
      return next;
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
