import { randomUUID } from 'node:crypto';
import { MANDATORY_RETRIEVAL_GRACE } from '@wbfm/shared/constants';
import type { TaskRunView } from '@wbfm/shared/schemas';
import { createTaskRunRepository } from '@wbfm/database';
import type { ToolContext } from '../tools/types';
import { executeToolCall, summarizeArgs } from '../tools/tool-executor';
import { gateToolPermission } from '../chat/tool-permission-gate';
import type { TaskPlanDecision } from './types';
import { createTaskLoopRuntime, stopForPolicyLimit } from './task-loop-runtime';
import { createTaskLoopControl, type TaskLoopEvent, type TaskLoopParams } from './control';
import { STEP_RESULT_MAX_CHARS, addFinalStep, createTaskLoopInternals, produceObserveStep, mandatoryRetrievalCorrection, type TaskLoopState } from './task-loop-helpers';
import { sys } from '../i18n/system-text';

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
  const observeMode = params.observeMode ?? 'screen';
  const repo = createTaskRunRepository(deps.db);
  const observeToolName = params.observeToolName ?? 'screen_snapshot';
  const toolCtx: ToolContext = {
    signal,
    knowledgeBaseIds: params.knowledgeBaseIds ?? [],
    visionCapable,
    retrieve: params.retrieve ?? (async () => []),
  };

  const state: TaskLoopState = {
    run: repo.updateRunStatus(params.run.id, 'running') ?? params.run,
    stepIndex: 0,
    consecutiveFailures: 0,
    correctionViolations: 0,
  };
  let pendingCorrection: string | undefined;
  const { toolCatalog, subtaskContext, runtimeLimits } = createTaskLoopRuntime({
    deps,
    runtime,
    allowedTools,
    run: state.run,
    ...(params.subtaskBrief
      ? { subtaskBrief: params.subtaskBrief, subtaskAcceptance: params.subtaskAcceptance }
      : {}),
  });
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

    /* ---- 运行时长策略限额（v2.13 M4） ---- */
    if (runtimeLimits.expired()) return yield* stopForPolicyLimit({ repo, finalize });

    /* ---- 观察（screen=截图；tool=合成工具观察，不截图；correction=强制纠正文本） ---- */
    state.stepIndex += 1;
    const observeStep = repo.addStep({
      runId: state.run.id,
      stepIndex: state.stepIndex,
      kind: 'observe',
      reason: pendingCorrection
        ? sys('agentTrace.step.retrievalCorrection')
        : observeMode === 'tool'
          ? sys('agentTrace.step.toolObserve')
          : sys('agentTrace.step.screenObserve'),
    });
    yield stepStarted(observeStep);
    const observed = await produceObserveStep({
      mode: observeMode,
      goal: state.run.goal,
      steps: repo.listSteps(state.run.id),
      pendingCorrection,
      consumeCorrection: () => {
        pendingCorrection = undefined;
      },
      runtime,
      deps,
      observeToolName,
      toolCtx,
      runId: state.run.id,
      stepIndex: state.stepIndex,
    });
    const observation = observed.observation;
    repo.finishStep(observeStep.id, {
      status: observed.status,
      resultJson: observed.resultJson,
      ...(observed.error ? { error: observed.error } : {}),
      durationMs: observed.durationMs,
      ...(observed.screenshotPath ? { screenshotPath: observed.screenshotPath } : {}),
    });
    const obsFinished = stepFinished(observeStep.id);
    if (obsFinished) yield obsFinished;
    if (!observation && observeMode === 'screen') {
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
        {
          goal: state.run.goal,
          steps: repo.listSteps(state.run.id),
          observation,
          allowedTools,
          observeMode,
          ...(subtaskContext ? { subtask: subtaskContext } : {}),
          ...(params.knowledgeBaseNames?.length ? { knowledgeBaseNames: params.knowledgeBaseNames } : {}),
          toolCatalog,
          maxSteps: state.run.maxSteps,
        },
        signal,
      );
    } catch (error) {
      if (signal?.aborted) {
        const fin = finalize('stopped', 'user_stop');
        yield fin.event;
        return fin.run;
      }
      const message = error instanceof Error ? error.message : String(error);
      const s = failStep(
        sys('agentTrace.step.modelDecision'),
        sys('agentTrace.step.decideFailed', { message }),
      );
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

    /* ---- 零检索收尾门控：授权知识库且未成功检索前，done/fail 驳回为强制纠正 ---- */
    const correction = mandatoryRetrievalCorrection({
      allowedTools,
      steps: repo.listSteps(state.run.id),
      decision,
      graceLeft: state.correctionViolations < MANDATORY_RETRIEVAL_GRACE,
    });
    if (correction) {
      state.correctionViolations += 1;
      pendingCorrection = correction;
      continue;
    }

    /* ---- 完成 / 宣告失败 ---- */
    if (decision.action !== 'tool') {
      const finalStep = addFinalStep(repo, state, decision);
      yield stepStarted(finalStep);
      const finalFinished = stepFinished(finalStep.id);
      if (finalFinished) yield finalFinished;
      const fin = decision.action === 'done' ? finalize('completed', 'completed') : finalize('failed', 'error');
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
      repo.finishStep(actionStep.id, {
        status: 'failed',
        error: sys('agentTrace.step.toolNotAllowed', { tool: toolName }),
      });
      const bad = stepFinished(actionStep.id);
      if (bad) yield bad;
      const hit = afterFail();
      if (hit) {
        yield hit.event;
        return hit.run;
      }
      continue;
    }
    const runtimeLimit = runtimeLimits.checkTool(resolved.tool, resolved.source);
    if (!runtimeLimit.allowed) {
      return yield* stopForPolicyLimit({
        repo,
        finalize,
        actionStepId: actionStep.id,
        error: `策略限额：${runtimeLimit.reason}`,
      });
    }
    if (deps.breakers?.isTripped(toolName)) {
      repo.finishStep(actionStep.id, {
        status: 'failed',
        error: sys('agentTrace.step.breakerTripped', { tool: toolName }),
      });
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
      args: decision.args ?? {},
      mode: state.run.permissionMode,
      workspacePath: state.run.workspacePath,
      assistantId: state.run.assistantId,
      taskScope: state.run.id,
      signal,
      source: resolved.source,
      permission: resolved.tool.permission ?? 'read',
      approvalContext: { runId: state.run.id, conversationId: state.run.conversationId, deepLink: `/tasks?run=${state.run.id}` },
    });
    if (gate.denied) {
      if (signal?.aborted) {
        const fin = finalize('stopped', 'user_stop');
        yield fin.event;
        return fin.run;
      }
      repo.finishStep(actionStep.id, { status: 'failed', error: sys('agentTrace.step.denied') });
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
      ...(result.citations ? { citations: result.citations } : {}),
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
