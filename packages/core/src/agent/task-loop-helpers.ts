import { TASK_MAX_FAILURES } from '@wbfm/shared/constants';
import { sys } from '../i18n/system-text';
import {
  type TaskEventType,
  type TaskRunStatus,
  type TaskRunView,
  type TaskStepView,
  type TaskStopReason,
} from '@wbfm/shared/schemas';
import { createTaskRunRepository } from '@wbfm/database';
import { createAttachmentService } from '../services/attachment-service';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { ToolContext } from '../tools/types';
import { executeToolCall } from '../tools/tool-executor';
import type { TaskLoopEvent } from './control';
import type { TaskObservation, TaskPlanDecision } from './types';

/** 落库 resultJson 截断上限（UIA 清单等长输出防爆行） */
export const STEP_RESULT_MAX_CHARS = 4000;

/** 主循环可变状态（事件/收尾/护栏闭包共享） */
export interface TaskLoopState {
  run: TaskRunView;
  stepIndex: number;
  consecutiveFailures: number;
  /** 零检索即收尾的强制纠正已用次数（≤ MANDATORY_RETRIEVAL_GRACE） */
  correctionViolations: number;
}

type TaskRunRepository = ReturnType<typeof createTaskRunRepository>;

/** 单个观察步的落库数据（reason/状态/结果/截图），由循环负责 addStep/finishStep */
export interface ObserveStepData {
  reason: string;
  status: 'completed' | 'failed';
  resultJson: string;
  error?: string;
  screenshotPath?: string;
  durationMs: number;
  observation: TaskObservation | null;
}

/**
 * 生产观察步数据（三路径，不落库——循环统一 addStep/finishStep 并发事件）：
 * - correction：门控强指令，不截图不调工具；
 * - tool：合成工具观察（含最近动作真实返回正文）；
 * - screen：截图观察（失败产 null + 系统错误）。
 */
export async function produceObserveStep(params: {
  mode: 'screen' | 'tool';
  goal: string;
  steps: TaskStepView[];
  pendingCorrection: string | undefined;
  consumeCorrection: () => void;
  runtime: ToolRuntime;
  deps: ServiceDeps;
  observeToolName: string;
  toolCtx: ToolContext;
  runId: string;
  stepIndex: number;
}): Promise<ObserveStepData> {
  const started = Date.now();
  const finish = (
    observation: TaskObservation | null,
    extra?: { error?: string; screenshotPath?: string },
  ): ObserveStepData => ({
    reason: params.pendingCorrection
      ? sys('agentTrace.step.retrievalCorrection')
      : params.mode === 'tool'
        ? sys('agentTrace.step.toolObserve')
        : sys('agentTrace.step.screenObserve'),
    status: observation ? 'completed' : 'failed',
    resultJson: JSON.stringify({ summary: (observation?.summary ?? '').slice(0, STEP_RESULT_MAX_CHARS) }),
    durationMs: Date.now() - started,
    observation,
    ...extra,
  });

  if (params.pendingCorrection) {
    const observation = { summary: params.pendingCorrection, screenshotPath: '' };
    params.consumeCorrection();
    return finish(observation);
  }
  if (params.mode === 'tool') {
    return finish(buildToolObservation(params.goal, params.steps));
  }
  const observation = await runObservation(
    params.runtime,
    params.deps,
    params.observeToolName,
    params.toolCtx,
    params.runId,
    params.stepIndex,
  );
  return finish(observation, {
    ...(observation ? {} : { error: sys('agentTrace.step.observeFailed') }),
    ...(observation?.screenshotPath ? { screenshotPath: observation.screenshotPath } : {}),
  });
}

/** 观察工具执行：截图落盘为附件，失败返回 null */
export async function runObservation(
  runtime: ToolRuntime,
  deps: ServiceDeps,
  toolName: string,
  ctx: ToolContext,
  runId: string,
  stepIndex: number,
): Promise<TaskObservation | null> {
  const resolved = runtime.resolveTool(toolName);
  if (!resolved) return null;
  const result = await executeToolCall(resolved.tool, {}, ctx);
  deps.breakers?.recordResult(toolName, result.ok);
  if (!result.ok) return null;
  const image = result.images?.[0];
  let screenshotPath = '';
  if (image) {
    try {
      const attachments = createAttachmentService(deps);
      screenshotPath = attachments.save({
        filename: `task-${runId}-${stepIndex}.png`,
        mimeType: image.mimeType,
        buffer: Buffer.from(image.dataBase64, 'base64'),
      }).id;
    } catch (error) {
      console.error('[task] 观察截图落盘失败:', error);
    }
  }
  return {
    summary: result.output,
    screenshotPath,
    ...(image ? { imageBase64: image.dataBase64, mimeType: image.mimeType } : {}),
  };
}

/**
 * v1.4 M2 tool 观察模式：不截图，观察内容=工具结果与检索片段。
 * - 首轮：给出目标/工具模式提示（动作历史为空）；
 * - 后续轮：完整注入上一动作的真实返回正文（截断防爆 token），失败注入错误。
 * v1.4 热修：旧文案只写「详细结果见历史步骤」而历史 digest 不含结果正文，
 * 模型实际盲调——工具 completed 却声称「未返回正文」并反复 fail。
 */
export function buildToolObservation(goal: string, steps: TaskStepView[]): TaskObservation {
  const lastAction = [...steps].reverse().find((s) => s.kind === 'action');
  if (!lastAction) {
    return {
      summary: [
        '【工具模式·无截图】本轮不观察屏幕，请直接决策。',
        `任务目标：${goal}`,
        '需要资料时调用知识检索类工具；拿到足够证据后以 done 给出结论。',
      ].join('\n'),
      screenshotPath: '',
    };
  }
  const head = `【工具模式·无截图】上一动作：${lastAction.toolName ?? '(未命名)'} → ${lastAction.status}`;
  if (lastAction.status !== 'completed') {
    return {
      summary: [
        head,
        `失败信息：${lastAction.error ?? '未知错误'}`,
        '请换路径重试；确认无法继续时再 fail 收尾。',
      ].join('\n'),
      screenshotPath: '',
    };
  }
  const result = readActionResult(lastAction.resultJson);
  const output = (result.output ?? '').trim();
  const clipped = output.slice(0, STEP_RESULT_MAX_CHARS);
  return {
    summary: [
      head,
      result.summary ? `结果摘要：${result.summary}` : '',
      output
        ? `工具返回内容（必须基于以下真实资料决定下一步：继续取证或 done 给出结论）：\n${clipped}`
        : '工具执行成功但未返回文本内容。',
      output.length > STEP_RESULT_MAX_CHARS ? `（内容较长，已截取前 ${STEP_RESULT_MAX_CHARS} 字符）` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    screenshotPath: '',
  };
}

/** 解析 action 步落库结果 {summary, output}（坏 JSON 容错为空对象） */
export function readActionResult(resultJson: string | null): { summary?: string; output?: string } {
  if (!resultJson) return {};
  try {
    return JSON.parse(resultJson) as { summary?: string; output?: string };
  } catch {
    return {};
  }
}

/**
 * 确定性门控：授权了 knowledge_search 却在任何成功检索之前输出 done/fail 时，
 * 返回强制纠正观察文本（弱模型会无视提示词硬规则声称「没有简历/页面无关」）。
 * 已在调用工具 / 已成功检索过 / 超出纠正宽限 → 返回 null 尊重模型决策。
 */
export function mandatoryRetrievalCorrection(params: {
  allowedTools: string[];
  steps: TaskStepView[];
  decision: TaskPlanDecision;
  graceLeft: boolean;
}): string | null {
  if (!params.graceLeft) return null;
  if (!params.allowedTools.includes('knowledge_search')) return null;
  if (params.decision.action === 'tool') return null;
  const retrieved = params.steps.some(
    (s) => s.kind === 'action' && s.toolName === 'knowledge_search' && s.status === 'completed',
  );
  if (retrieved) return null;
  return [
    '【系统纠正·上一步决策无效】当前助手已授权私有知识库，但你尚未调用过 knowledge_search，',
    '在此之前禁止以「没有简历/资料缺失/页面与任务无关/需要用户提供」为由 done 或 fail。',
    '你下一步唯一合法决策是调用检索工具，例如：',
    '{"action":"tool","tool":"knowledge_search","args":{"query":"与任务最相关的关键词"},"reason":"先检索授权知识库取证"}',
    '拿到检索结果后再综合输出；检索确无结果才可在 unfinished 中说明并收尾。',
  ].join('');
}

/** done/fail 决策落 final 步并返回该步视图（事件由循环 yield） */
export function addFinalStep(
  repo: TaskRunRepository,
  state: TaskLoopState,
  decision: TaskPlanDecision,
): TaskStepView {
  state.stepIndex += 1;
  const ok = decision.action === 'done';
  const finalStep = repo.addStep({
    runId: state.run.id,
    stepIndex: state.stepIndex,
    kind: 'final',
    reason: decision.reason,
  });
  repo.finishStep(finalStep.id, {
    status: ok ? 'completed' : 'failed',
    resultJson: JSON.stringify({
      message: decision.message ?? '',
      ...(decision.unfinished ? { unfinished: decision.unfinished } : {}),
    }),
    ...(ok ? {} : { error: decision.message || decision.reason }),
  });
  return finalStep;
}

/** 主循环内部闭包：事件构造 / 终态收尾 / 步数与连续失败护栏 / 失败步落库 */
export function createTaskLoopInternals(params: {
  repo: TaskRunRepository;
  deps: ServiceDeps;
  state: TaskLoopState;
}) {
  const { repo, deps, state } = params;
  const taskEvent = (type: TaskEventType, step?: TaskStepView): TaskLoopEvent => ({
    event: 'task',
    data: { type, runId: state.run.id, conversationId: state.run.conversationId, run: state.run, ...(step ? { step } : {}) },
  });
  const stepStarted = (step: TaskStepView) => taskEvent('step_started', step);
  const stepFinished = (stepId: string) => {
    const fresh = repo.listSteps(state.run.id).find((s) => s.id === stepId);
    return fresh ? taskEvent('step_finished', fresh) : null;
  };
  const finalize = (status: TaskRunStatus, stopReason: TaskStopReason) => {
    const updated = repo.updateRunStatus(state.run.id, status, stopReason) ?? state.run;
    deps.taskGrants?.clear(state.run.id);
    return { run: updated, event: { event: 'task', data: { type: 'run_finished', runId: updated.id, conversationId: updated.conversationId, run: updated } } as TaskLoopEvent };
  };
  const checkLimits = (): { run: TaskRunView; event: TaskLoopEvent } | null => {
    if (state.consecutiveFailures >= TASK_MAX_FAILURES) return finalize('failed', 'max_failures');
    if (state.run.stepCount >= state.run.maxSteps) return finalize('stopped', 'max_steps');
    return null;
  };
  const failStep = (reason: string, error: string) => {
    state.stepIndex += 1;
    const s = repo.addStep({ runId: state.run.id, stepIndex: state.stepIndex, kind: 'action', reason });
    repo.finishStep(s.id, { status: 'failed', error });
    return s;
  };
  const afterFail = () => {
    state.consecutiveFailures += 1;
    state.run = repo.incrementRunCounters(state.run.id, { failed: true }) ?? state.run;
    return checkLimits();
  };
  return { taskEvent, stepStarted, stepFinished, finalize, checkLimits, failStep, afterFail };
}
