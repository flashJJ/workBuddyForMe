import { randomUUID } from 'node:crypto';
import type { TaskRunView } from '@wbfm/shared/schemas';
import { createTaskRunRepository } from '@wbfm/database';
import type { ToolContext } from '../tools/types';
import { executeToolCall, summarizeArgs } from '../tools/tool-executor';
import { gateToolPermission } from '../chat/tool-permission-gate';
import type { TaskPlanDecision } from './types';
import {
  createTaskLoopControl,
  type TaskLoopEvent,
  type TaskLoopParams,
} from './control';
import {
  STEP_RESULT_MAX_CHARS,
  createTaskLoopInternals,
  runObservation,
  type TaskLoopState,
} from './task-loop-helpers';

/**
 * 任务 Agent 循环：观察 → 决策 → 门控 → 执行 → 再观察。
 * 护栏：步数上限（maxSteps）+ 连续失败上限（TASK_MAX_FAILURES）+ 熔断联动
 * （目标工具已熔断直接终止）+ AbortSignal/控制句柄急停；全程落库 task_steps。
 * 生成器返回终态运行视图。
 */
export async function* runTaskLoop(
  params: TaskLoopParams,
): AsyncGenerator<TaskLoopEvent, TaskRunView> {
  const { deps, runtime, planner, allowedTools, visionCapable, signal } = params;
  const control = params.control ?? createTaskLoopControl();
  const repo = createTaskRunRepository(deps.db);
  const observeToolName = params.observeToolName ?? 'screen_snapshot';
  const toolCtx: ToolContext = {
    signal,
    knowledgeBaseId: null,
    visionCapable,
    retrieve: async () => [],
  };

  const state: TaskLoopState = {
    run: repo.updateRunStatus(params.run.id, 'running') ?? params.run,
    stepIndex: 0,
    consecutiveFailures: 0,
  };
  const { taskEvent, stepStarted, stepFinished, finalize, checkLimits, failStep, afterFail } =
    createTaskLoopInternals({ repo, deps, state });

  yield taskEvent('run_started');

  for (;;) {
    if (signal?.aborted || control.state === 'stopped') {
      const fin = finalize('stopped', 'user_stop');
      yield fin.event;
      return fin.run;
    }
    if (control.state === 'paused') {
      state.run = repo.updateRunStatus(state.run.id, 'paused') ?? state.run;
      yield taskEvent('run_paused');
      await control.waitIfPaused();
      if ((control.state as string) === 'stopped' || signal?.aborted) {
        const fin = finalize('stopped', 'user_stop');
        yield fin.event;
        return fin.run;
      }
      state.run = repo.updateRunStatus(state.run.id, 'running') ?? state.run;
      yield taskEvent('run_resumed');
    }

    /* ---- 观察 ---- */
    state.stepIndex += 1;
    const observeStep = repo.addStep({ runId: state.run.id, stepIndex: state.stepIndex, kind: 'observe', reason: '观察当前屏幕状态' });
    yield stepStarted(observeStep);
    const obsStarted = Date.now();
    const observation = await runObservation(runtime, deps, observeToolName, toolCtx, state.run.id, state.stepIndex);
    repo.finishStep(observeStep.id, {
      status: observation ? 'completed' : 'failed',
      resultJson: JSON.stringify({ summary: (observation?.summary ?? '').slice(0, STEP_RESULT_MAX_CHARS) }),
      ...(observation ? {} : { error: '观察失败：屏幕感知不可用' }),
      durationMs: Date.now() - obsStarted,
      ...(observation?.screenshotPath ? { screenshotPath: observation.screenshotPath } : {}),
    });
    const obsFinished = stepFinished(observeStep.id);
    if (obsFinished) yield obsFinished;
    if (!observation) {
      const hit = afterFail();
      if (hit) {
        yield hit.event;
        return hit.run;
      }
      continue;
    }
    if (signal?.aborted) {
      const fin = finalize('stopped', 'user_stop');
      yield fin.event;
      return fin.run;
    }

    /* ---- 决策 ---- */
    let decision: TaskPlanDecision;
    try {
      decision = await planner.decide(
        { goal: state.run.goal, steps: repo.listSteps(state.run.id), observation, allowedTools },
        signal,
      );
    } catch (error) {
      if (signal?.aborted) {
        const fin = finalize('stopped', 'user_stop');
        yield fin.event;
        return fin.run;
      }
      const message = error instanceof Error ? error.message : String(error);
      const s = failStep('模型决策', `决策失败：${message}`);
      const f = stepFinished(s.id);
      if (f) yield f;
      const hit = afterFail();
      if (hit) {
        yield hit.event;
        return hit.run;
      }
      continue;
    }
    if (signal?.aborted) {
      const fin = finalize('stopped', 'user_stop');
      yield fin.event;
      return fin.run;
    }

    /* ---- 完成 / 宣告失败 ---- */
    if (decision.action !== 'tool') {
      state.stepIndex += 1;
      const ok = decision.action === 'done';
      const finalStep = repo.addStep({ runId: state.run.id, stepIndex: state.stepIndex, kind: 'final', reason: decision.reason });
      yield stepStarted(finalStep);
      repo.finishStep(finalStep.id, {
        status: ok ? 'completed' : 'failed',
        resultJson: JSON.stringify({ message: decision.message ?? '' }),
        ...(ok ? {} : { error: decision.message || decision.reason }),
      });
      const finalFinished = stepFinished(finalStep.id);
      if (finalFinished) yield finalFinished;
      const fin = ok ? finalize('completed', 'completed') : finalize('failed', 'error');
      yield fin.event;
      return fin.run;
    }

    /* ---- 工具动作 ---- */
    const toolName = decision.tool ?? '';
    const resolved = runtime.resolveTool(toolName);
    state.stepIndex += 1;
    const actionStep = repo.addStep({
      runId: state.run.id,
      stepIndex: state.stepIndex,
      kind: 'action',
      toolName: toolName || null,
      reason: decision.reason,
      argsJson: JSON.stringify(decision.args ?? {}).slice(0, STEP_RESULT_MAX_CHARS),
    });
    yield stepStarted(actionStep);

    if (!resolved || !allowedTools.includes(toolName)) {
      repo.finishStep(actionStep.id, { status: 'failed', error: `工具不可用或不在任务白名单：${toolName}` });
      const bad = stepFinished(actionStep.id);
      if (bad) yield bad;
      const hit = afterFail();
      if (hit) {
        yield hit.event;
        return hit.run;
      }
      continue;
    }
    if (deps.breakers?.isTripped(toolName)) {
      repo.finishStep(actionStep.id, { status: 'failed', error: `工具 ${toolName} 已熔断，任务终止` });
      const tripped = stepFinished(actionStep.id);
      if (tripped) yield tripped;
      const fin = finalize('failed', 'breaker');
      yield fin.event;
      return fin.run;
    }

    const callId = `task-${randomUUID()}`;
    const gate = yield* gateToolPermission({
      deps,
      tool: resolved.tool,
      toolName,
      callId,
      argsSummary: summarizeArgs(toolName, decision.args ?? {}),
      assistantId: state.run.assistantId,
      taskScope: state.run.id,
      signal,
      source: resolved.source,
      permission: resolved.tool.permission ?? 'read',
    });
    if (gate.denied) {
      if (signal?.aborted) {
        const fin = finalize('stopped', 'user_stop');
        yield fin.event;
        return fin.run;
      }
      repo.finishStep(actionStep.id, { status: 'failed', error: '用户拒绝授权' });
      const denied = stepFinished(actionStep.id);
      if (denied) yield denied;
      const hit = afterFail();
      if (hit) {
        yield hit.event;
        return hit.run;
      }
      continue;
    }

    const startedAt = Date.now();
    const result = await executeToolCall(resolved.tool, decision.args ?? {}, toolCtx);
    const durationMs = Date.now() - startedAt;
    deps.breakers?.recordResult(toolName, result.ok);
    repo.finishStep(actionStep.id, {
      status: result.ok ? 'completed' : 'failed',
      resultJson: JSON.stringify({ summary: result.summary, output: result.output.slice(0, STEP_RESULT_MAX_CHARS) }),
      ...(result.ok ? {} : { error: result.summary }),
      durationMs,
    });
    const actFinished = stepFinished(actionStep.id);
    if (actFinished) yield actFinished;
    state.consecutiveFailures = result.ok ? 0 : state.consecutiveFailures + 1;
    state.run = repo.incrementRunCounters(state.run.id, { failed: !result.ok }) ?? state.run;
    const hit = checkLimits();
    if (hit) {
      yield hit.event;
      return hit.run;
    }
  }
}
