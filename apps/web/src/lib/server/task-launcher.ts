import { ApiError } from '@wbfm/shared/errors';
import { TASK_MAX_STEPS, resolveClampedBudget } from '@wbfm/shared/constants';
import { createLlmPlanner, type TaskPlanner } from '@wbfm/core/agent';
import { buildTaskContextBlock } from '@wbfm/core/agents';
import { buildSceneSnapshot, estimateTokens, recordSceneSnapshot } from '@wbfm/core/context';
import { resolveChatTarget } from '@wbfm/core/chat';
import type { ServiceDeps } from '@wbfm/core/services';
import type { ServiceContainer } from './container';
import type { SceneContextSnapshotPayload, TaskRunView } from '@wbfm/shared/schemas';

/**
 * v0.7 M3-4b 任务启动辅助：
 * 从已落库的 queued 运行记录解析（conversation → assistant → 模型 → 视觉能力），
 * 组装 TaskStartParams 子集（planner / allowedTools / visionCapable）。
 *
 * 设计动机：planner 与 visionCapable 都依赖运行时解析的对话模型，无法在 createRun 时确定；
 * 抽到此处复用，避免 /events 路由与未来调度入口重复实现。
 */

/** v0.7 内置桌面能力工具白名单（不论助手配置都参与任务模式） */
export const COMPUTER_BUILTIN_TOOLS = [
  'screen_snapshot',
  'mouse_move',
  'mouse_click',
  'mouse_scroll',
  'keyboard_type',
  'keyboard_press',
  'window_list',
  'window_focus',
  'app_launch',
  'uia_list',
  // v2.13 M5：隔离网页会话
  'browser_open',
  'browser_read',
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_close',
] as const;

export interface TaskLaunchArtifacts {
  planner: TaskPlanner;
  allowedTools: string[];
  visionCapable: boolean;
  /** v4.9：启动时一次性装配的会话上下文（无会话/装配失败时省略） */
  contextBlock?: string;
}

/** v4.9：任务决策器快照节流——首条必写，之后仅在发生截断时补写 */
export function createTaskSnapshotWriter(
  record: (payload: SceneContextSnapshotPayload) => void,
): (stats: SceneContextSnapshotPayload) => void {
  let emitted = false;
  let wasTruncated = false;
  return (stats) => {
    if (!emitted || (stats.truncated && !wasTruncated)) record(stats);
    emitted = true;
    wasTruncated = stats.truncated;
  };
}

/** 由 run 反查会话/助手/模型，构造 planner + 工具白名单 + 视觉能力 + 会话上下文 */
export async function resolveTaskLaunchArtifacts(
  services: ServiceContainer,
  run: TaskRunView,
): Promise<TaskLaunchArtifacts> {
  const conversation = services.conversations.get(run.conversationId);
  const assistant = services.assistants.get(conversation.assistantId);
  const target = resolveChatTarget(
    { db: services.db, cipher: services.cipher },
    assistant,
  );
  const visionCapable = target.model.capabilities.includes('vision');
  if (!visionCapable) {
    throw ApiError.validation(
      '当前助手绑定的模型不具备视觉能力，无法运行桌面任务（请改用 qwen2.5vl 等视觉模型）',
    );
  }
  // 助手已启用的工具 + 内置桌面能力；去重保序
  const merged = new Set<string>([...assistant.enabledTools, ...COMPUTER_BUILTIN_TOOLS]);
  // v4.9：快照/上下文装配只需要最小依赖子集，避免把整个容器当 ServiceDeps 传递
  const taskDeps: ServiceDeps = {
    db: services.db,
    cipher: services.cipher,
    events: services.sessionLog,
    workPlans: services.workPlans,
  };
  // 首条决策写快照；之后仅在发生截断时补写，控制任务事件量
  const onContextStats = createTaskSnapshotWriter((payload) =>
    recordSceneSnapshot(taskDeps, { scope: 'task', scopeId: run.id, payload }),
  );
  const planner = createLlmPlanner(target, {
    scene: 'task_step',
    onContextStats,
  });
  const contextBlock = await buildTaskContextBlock(taskDeps, {
    conversationId: run.conversationId,
    goal: run.goal,
    assistantId: conversation.assistantId,
    memoryEnabled: assistant.memoryEnabled,
    contextWindow: target.model.contextWindow,
  }).catch(() => null);
  if (contextBlock) {
    recordSceneSnapshot(taskDeps, {
      scope: 'task',
      scopeId: run.id,
      payload: buildSceneSnapshot({
        scene: 'task_start',
        contextWindow: target.model.contextWindow,
        promptTokens: estimateTokens(contextBlock),
        budgetTokens: resolveClampedBudget(target.model.contextWindow, 'contextBlock'),
      }),
    });
  }
  return {
    planner,
    allowedTools: [...merged],
    visionCapable,
    ...(contextBlock ? { contextBlock } : {}),
  };
}

/** 创建运行时使用的步数上限：用户未传则取默认 TASK_MAX_STEPS */
export function resolveMaxSteps(input: { maxSteps?: number } | undefined): number {
  return input?.maxSteps ?? TASK_MAX_STEPS;
}
