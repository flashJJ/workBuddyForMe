import { MAX_TOOL_ROUNDS } from '@wbfm/shared/constants';
import { type TokenUsage } from '@wbfm/shared/api';
import { startRun, type TraceHandle, type ToolCall } from '@wbfm/ai';
import type { ServiceDeps } from '../../services/base/deps';
import { createAssistantsService } from '../../services/assistant/assistant-service';
import { createAttachmentService } from '../../services/assistant/attachment-service';
import { createConversationService } from '../../services/assistant/conversation-service';
import { resolveChatTarget, resolveFallbackChatTargets, resolveForcedFallbackTarget, type ResolvedChatTarget } from '../context/model-resolver';
import { runAlwaysRetrieval } from '../turns/retrieve-turn';
import { prepareUserTurn } from '../context/turn-preparation';
import { runProviderTurnWithModelFallback, buildModelSwitchNotice, type ModelFallbackTurnResult } from '../tools/model-fallback';
import { runToolCallLoop } from '../tools/tool-call-loop';
import { createProactiveTurn } from '../turns/proactive-turn';
import { tryReminderTurn } from '../turns/reminder-turn';
import { createEmotionGate } from '../turns/emotion-gate';
import type { OrchestratorEvent, StreamChatInput } from '../base/types';
import { createFetchDegradeTracker, normalizeFailure } from './orchestrator-helpers';
import { checkConversationBudget } from './budget';
import { finalizeSuccessfulTurn } from './finalize';
import { finishWithSynthesis } from './round-synthesis';
import { createToolRuntime } from '../../tools/tool-runtime';
import { createMemoryService } from '../../memory/memory-service';
import { createEmotionService } from '../../emotion/index';
import { stripEmotionSignalBlock } from '@wbfm/shared/schemas';
import { prepareTurnContext, type PreparedTurnContext } from '../context/turn-context-assembly';
import { runIntentStage } from './intent-stage';
import { createBackgroundJobRegistry } from './background-jobs';

export function createChatOrchestrator(deps: ServiceDeps) {
  const assistants = createAssistantsService(deps);
  const conversations = createConversationService(deps);
  const attachments = createAttachmentService(deps);
  const runtime = createToolRuntime(deps);
  const memory = createMemoryService(deps);
  const emotion = createEmotionService(deps);
  // done 之后异步执行的旁路任务（摘要/记忆）；不阻塞响应，但保留句柄供测试与优雅关闭等待
  const backgroundJobs = createBackgroundJobRegistry();

  return {
    /** 等待全部在途的回合后台任务完成（测试/优雅关闭用；对话响应本身不等待） */
    waitForBackgroundJobs: backgroundJobs.wait,
    ...createEmotionGate(emotion),
    async *streamChat(input: StreamChatInput): AsyncGenerator<OrchestratorEvent> {
      const assistant = assistants.get(input.assistantId);

      // 开流前准备：先确定会话（读取会话级模型覆盖），再解析模型与校验附件
      let target: ResolvedChatTarget;
      let conversationId: string;
      let userContent: string;
      try {
        const existing = input.conversationId ? conversations.get(input.conversationId) : null;
        // 新建会话先按助手/系统默认校验，避免无模型时留下空会话
        target = resolveChatTarget(deps, assistant, existing?.modelId ?? null);
        if (input.forceFallback) {
          target = resolveForcedFallbackTarget(deps, assistant, target.model, existing?.id ?? null);
        }
        conversationId = existing?.id ?? conversations.create(assistant.id).id;
        if (!existing) target = resolveChatTarget(deps, assistant, conversations.get(conversationId).modelId);
        ({ userContent } = prepareUserTurn({
          conversationId,
          input,
          target,
          conversations,
          attachments,
        }));
      } catch (error) {
        yield { event: 'error', data: normalizeFailure(error) };
        return;
      }

      const assistantMessage = conversations.appendMessage({
        conversationId,
        role: 'assistant',
        content: '',
        status: 'streaming',
      });
      yield {
        event: 'meta',
        data: { messageId: assistantMessage.id, conversationId },
      };

      // v4.18：会话 token 预算（80% 提示，100% 拦截；不计本轮尚未产生的用量）
      const budget = checkConversationBudget(conversations, conversationId);
      if (budget.exceeded) {
        conversations.markMessageError(assistantMessage.id, budget.exceeded.code, budget.exceeded.message);
        yield { event: 'error', data: budget.exceeded };
        return;
      }
      if (budget.warning) yield { event: 'budget_warning', data: budget.warning };

      // v1.7 M5：「提醒我/叫我…」本地解析短路——建提醒或追问，零模型调用
      const reminderEvents = await tryReminderTurn({
        deps,
        db: deps.db,
        assistantId: input.assistantId,
        assistantMessageId: assistantMessage.id,
        userText: userContent,
      });
      if (reminderEvents) {
        for (const event of reminderEvents) yield event;
        return;
      }

      // v4.8：意图识别与显式记忆意图（记住/忘掉）在检索与装配前完成
      const { intent, notices: intentNotices } = await runIntentStage({
        deps,
        assistant,
        memory,
        conversationId,
        sourceMessageId: assistantMessage.id,
        userContent,
        hasImages: (input.attachments?.length ?? 0) > 0,
        applyMemory: !input.regenerate,
        signal: input.signal,
      });

      // LangSmith 顶层 span：一次完整对话（含模型多轮 + 工具 + RAG）聚成一棵树
      const turnTrace: TraceHandle | null = await startRun({
        name: 'chat-turn',
        runType: 'chain',
        inputs: {
          assistantId: input.assistantId,
          conversationId,
          regenerate: Boolean(input.regenerate),
          content: userContent,
        },
        metadata: { app: 'workbuddy' },
      });
      let full = '';
      let usage: TokenUsage | null = null;
      let turnError: unknown = null;

      try {
        const retrieval = yield* runAlwaysRetrieval({
          assistant,
          userContent,
          retrieve: input.retrieve,
          signal: input.signal,
          traceParent: turnTrace,
          assistantMessageId: assistantMessage.id,
          conversations,
        });
        if (retrieval.aborted || retrieval.failed) return;
        const retrieved = retrieval.retrieved;

        // 回合上下文装配：历史/图片、记忆召回与技能注入、工具声明/出站消息预算
        const prepared: PreparedTurnContext = yield* prepareTurnContext({
          deps,
          runtime,
          assistant,
          conversations,
          attachments,
          memory,
          emotion,
          conversationId,
          assistantMessageId: assistantMessage.id,
          userContent,
          retrieved,
          intent,
          signal: input.signal,
          traceParent: turnTrace,
          target,
        });
        const { conversation, toolMap, toolDefs, outgoing, toolCtx, toolMessageBudgetTokens, trace, researchDepth, contextWindow } = prepared;
        const fallbackTargets = input.forceFallback
          ? []
          : resolveFallbackChatTargets(deps, assistant, target.model, conversationId);
        let citations = prepared.citations;
        const fetchDegrade = createFetchDegradeTracker();
        const emotionEnabled = prepared.emotionEnabled;
        let hitRoundLimit = false;        try {
          for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
            const turn = runProviderTurnWithModelFallback({
              target,
              fallbacks: fallbackTargets,
              assistant,
              messages: outgoing,
              tools: toolDefs,
              signal: input.signal,
              traceParent: turnTrace,
              hasOutput: full.length > 0,
              onSwitch: (event) => deps.events?.recordChat(conversationId, 'model_switched', event),
              buildSwitchNotice: (event, from, to) =>
                buildModelSwitchNotice({
                  event,
                  from,
                  to,
                  conversationId,
                  messageId: assistantMessage.id,
                }),
            });
            let outcome: ModelFallbackTurnResult;
            while (true) {
              const step = await turn.next();
              if (step.done) {
                outcome = step.value;
                break;
              }
              if (step.value.event === 'delta') full += step.value.data.content;
              yield step.value;
            }
            if (outcome.usage) usage = outcome.usage;
            target = outcome.target;
            const calls: ToolCall[] = outcome.toolCalls;
            if (calls.length === 0) break;
            if (round === MAX_TOOL_ROUNDS) {
              // 最后一轮仍要调工具：没有下一轮可回灌，改走不带工具的收尾轮成文
              hitRoundLimit = true;
              break;
            }
            outgoing.push({ role: 'assistant', content: outcome.content || null, toolCalls: calls });

            const loopOutcome = yield* runToolCallLoop({
              calls,
              toolMap,
              toolCtx,
              deps,
              runtime,
              assistantId: assistant.id,
              taskScope: conversationId,
              approvalContext: { conversationId, deepLink: `/chat?conversation=${conversationId}` },
              turnTrace,
              trace,
              outgoing,
              citations,
              toolMessageBudgetTokens,
              contextWindow,
              researchDepth,
              fetchFailures: fetchDegrade.failures,
              signal: input.signal,
              onAbort: () => {
                conversations.stopMessage(
                  assistantMessage.id,
                  emotionEnabled ? stripEmotionSignalBlock(full) : full,
                );
                conversations.saveMessageToolTrace(assistantMessage.id, trace);
              },
            });
            citations = loopOutcome.citations;
            fetchDegrade.record(loopOutcome.degradedFetchUrls, outgoing);
            if (loopOutcome.aborted) {
              const abortedContent = emotionEnabled ? stripEmotionSignalBlock(full) : full;
              yield { event: 'done', data: { content: abortedContent, usage } };
              return;
            }
          }
          const finished = yield* finishWithSynthesis({
            target, assistant, outgoing, full, hitRoundLimit, signal: input.signal, traceParent: turnTrace,
          });
          full = finished.content;
          if (finished.usage) usage = finished.usage;
        } catch (error) {
          if (input.signal?.aborted) {
            // 中止不记录情绪；但持久化前剥离可能已流出的半截尾块
            const abortedContent = emotionEnabled ? stripEmotionSignalBlock(full) : full;
            conversations.stopMessage(assistantMessage.id, abortedContent);
            conversations.saveMessageToolTrace(assistantMessage.id, trace);
            yield { event: 'done', data: { content: abortedContent, usage } };
            return;
          }
          turnError = error;
          const failure = normalizeFailure(error);
          conversations.markMessageError(
            assistantMessage.id,
            failure.code,
            failure.message,
            target.model.id,
          );
          conversations.saveMessageToolTrace(assistantMessage.id, trace);
          yield { event: 'error', data: failure };
          return;
        }

        // v4.18：情绪解析、落库、done 与后台任务收口到独立 helper（保持主流程可读）
        const finalState = { full, usage };
        yield* finalizeSuccessfulTurn({
          deps, conversations, attachments, assistant, conversation,
          target, toolDefs, memory, emotion, emotionEnabled,
          assistantMessageId: assistantMessage.id, userContent,
          citations, intentNotices, trace, signal: input.signal,
          state: finalState, schedule: backgroundJobs.schedule,
        });
        full = finalState.full;
        usage = finalState.usage;
      } finally {
        await turnTrace?.end(
          { content: full, usage, aborted: Boolean(input.signal?.aborted) },
          turnError ?? undefined,
        );
      }
    },

    /** F8 主动说话：轻量 skip-history 轮（不落库/无工具/RAG） */
    streamProactive: createProactiveTurn(deps),
  };
}

export type ChatOrchestrator = ReturnType<typeof createChatOrchestrator>;
