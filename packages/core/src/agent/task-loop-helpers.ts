import { TASK_MAX_FAILURES } from '@wbfm/shared/constants';
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
import type { TaskObservation } from './types';

/** 落库 resultJson 截断上限（UIA 清单等长输出防爆行） */
export const STEP_RESULT_MAX_CHARS = 4000;

/** 主循环可变状态（事件/收尾/护栏闭包共享） */
export interface TaskLoopState {
  run: TaskRunView;
  stepIndex: number;
  consecutiveFailures: number;
}

type TaskRunRepository = ReturnType<typeof createTaskRunRepository>;

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
