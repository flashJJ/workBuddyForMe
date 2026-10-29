import { MAX_TOOL_ROUNDS } from '@wbfm/shared/constants';
import { type TokenUsage } from '@wbfm/shared/api';
import { startRun, type TraceHandle, type ToolCall } from '@wbfm/ai';
import type { ServiceDeps } from '../services/deps';
import { createAssistantsService } from '../services/assistant-service';
import { createAttachmentService } from '../services/attachment-service';
import { createConversationService } from '../services/conversation-service';
import { resolveChatTarget, type ResolvedChatTarget } from './model-resolver';
import { runAlwaysRetrieval } from './retrieve-turn';
import { prepareUserTurn } from './turn-preparation';
import { runProviderTurnWithToolFallback, type ProviderTurn } from './tool-runner';
import { runToolCallLoop } from './tool-call-loop';
import { createProactiveTurn, type StreamProactiveInput } from './proactive-turn';
import { tryReminderTurn } from './reminder-turn';
import { createEmotionGate } from './emotion-gate';
import type { OrchestratorEvent, StreamChatInput } from './types';
import { ROUND_LIMIT_FALLBACK, normalizeFailure } from './orchestrator-helpers';
import { createToolRuntime } from '../tools/tool-runtime';
import { createMemoryService } from '../memory/memory-service';
import { recordMilestone } from '../services/milestones';
import { createEmotionService, recordTurnEmotion } from '../emotion';
import { stripEmotionSignalBlock, type EmotionSignal } from '@wbfm/shared/schemas';
import { prepareTurnContext, type PreparedTurnContext } from './turn-context-assembly';
import { schedulePostTurnJobs } from './post-turn-schedule';

export function createChatOrchestrator(deps: ServiceDeps) {
  const assistants = createAssistantsService(deps);
  const conversations = createConversationService(deps);
  const attachments = createAttachmentService(deps);
  const runtime = createToolRuntime(deps);
  const memory = createMemoryService(deps);
  const emotion = createEmotionService(deps);
  const streamProactiveTurn = createProactiveTurn(deps);
  // done 之后异步执行的旁路任务（摘要/记忆）；不阻塞响应，但保留句柄供测试与优雅关闭等待
  const backgroundJobs = new Set<Promise<unknown>>();
  const scheduleBackgroundJob = (job: Promise<unknown>): void => {
    backgroundJobs.add(job);
    void job.finally(() => backgroundJobs.delete(job));
  };

  return {
    /** 等待全部在途的回合后台任务完成（测试/优雅关闭用；对话响应本身不等待） */
    waitForBackgroundJobs: async (): Promise<void> => {
      await Promise.allSettled([...backgroundJobs]);
    },
    ...createEmotionGate(emotion),
    async *streamChat(input: StreamChatInput): AsyncGenerator<OrchestratorEvent> {
      const assistant = assistants.get(input.assistantId);

      // 开流前准备：模型解析（含 vision 门控）、附件校验、用户消息落库
      let target: ResolvedChatTarget;
      let conversationId: string;
      let userContent: string;
      try {
        target = resolveChatTarget(deps, assistant);
        ({ conversationId, userContent } = prepareUserTurn({
          assistant,
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
          signal: input.signal,
          traceParent: turnTrace,
          target,
        });
        const { conversation, toolMap, toolDefs, outgoing, toolCtx, toolMessageBudgetTokens, trace } =
          prepared;
        let citations = prepared.citations;
        const emotionEnabled = prepared.emotionEnabled;

        try {
          for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
            // 手动迭代：delta 直接累积到 full，保证中途 abort 也能保留已产出片段
            const turn = runProviderTurnWithToolFallback({
              target,
              assistant,
              messages: outgoing,
              tools: toolDefs,
              signal: input.signal,
              traceParent: turnTrace,
            });
            let outcome: ProviderTurn;
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

            const calls: ToolCall[] = outcome.toolCalls;
            if (calls.length === 0) break;
            if (round === MAX_TOOL_ROUNDS) break;

            outgoing.push({ role: 'assistant', content: outcome.content || null, toolCalls: calls });

            const loopOutcome = yield* runToolCallLoop({
              calls,
              toolMap,
              toolCtx,
              deps,
              runtime,
              assistantId: assistant.id,
              taskScope: conversationId,
              approvalContext: {
                conversationId,
                deepLink: `/chat?conversation=${conversationId}`,
              },
              turnTrace,
              trace,
              outgoing,
              citations,
              toolMessageBudgetTokens,
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
            if (loopOutcome.aborted) {
              const abortedContent = emotionEnabled
                ? stripEmotionSignalBlock(full)
                : full;
              yield { event: 'done', data: { content: abortedContent, usage } };
              return;
            }
          }

          if (!full.trim()) {
            full = ROUND_LIMIT_FALLBACK;
            yield { event: 'delta', data: { content: full } };
          }
        } catch (error) {
          if (input.signal?.aborted) {
            // 中止不记录情绪；但持久化前剥离可能已流出的半截尾块
            const abortedContent = emotionEnabled
              ? stripEmotionSignalBlock(full)
              : full;
            conversations.stopMessage(assistantMessage.id, abortedContent);
            conversations.saveMessageToolTrace(assistantMessage.id, trace);
            yield { event: 'done', data: { content: abortedContent, usage } };
            return;
          }
          turnError = error;
          const failure = normalizeFailure(error);
          conversations.markMessageError(assistantMessage.id, failure.code, failure.message);
          conversations.saveMessageToolTrace(assistantMessage.id, trace);
          yield { event: 'error', data: failure };
          return;
        }

        // v1.6：成功回合的情绪解析——尾块剥离（落库/气泡/TTS 均不含协议块）、
        // 弱模型规则保底、写入情绪状态与事件流水。任何异常都不得影响已完成的正文。
        const recordedEmotion = recordTurnEmotion({
          enabled: emotionEnabled,
          rawContent: full,
          userContent,
          assistantId: assistant.id,
          messageId: assistantMessage.id,
          record: emotion.record,
        });
        if (recordedEmotion) full = recordedEmotion.content;
        const resolvedEmotion: EmotionSignal | undefined = recordedEmotion?.signal;

        // 持久化最终引用（含开流前 RAG 与工具循环 knowledge_search 两路合并后的全集）
        conversations.completeMessage(assistantMessage.id, full, usage, citations);
        conversations.saveMessageToolTrace(assistantMessage.id, trace);
        // v2.4 M1 T7：首次完整回答即记里程碑（首写优先；不含回答内容）
        recordMilestone(deps.db, 'firstAnswerAt');

        // 先把 done 交给用户：回答已完整落库，UI 立即结束 loading。
        // 摘要压缩/长期记忆是旁路 LLM 任务（本地 14B 上可能再花十几秒），
        // 绝不能阻塞 done——否则会出现「文字已出完但停止生成一直转」。
        yield {
          event: 'done',
          data: resolvedEmotion
            ? { content: full, usage, emotion: resolvedEmotion }
            : { content: full, usage },
        };

        // 后台任务 fire-and-forget：用独立 signal（响应关闭会 abort 请求 signal，
        // 但摘要/记忆不应随之丢弃），超时兜底；失败内部均已静默。
        schedulePostTurnJobs({
          schedule: scheduleBackgroundJob,
          aborted: Boolean(input.signal?.aborted),
          jobs: {
            conversations,
            attachments,
            conversation,
            assistant,
            target,
            toolDefs,
            lastCompletionTokens: usage?.completionTokens ?? null,
            memory,
            userContent,
            assistantContent: full,
            sourceMessageId: assistantMessage.id,
          },
        });
      } finally {
        await turnTrace?.end(
          { content: full, usage, aborted: Boolean(input.signal?.aborted) },
          turnError ?? undefined,
        );
      }
    },

    /** F8 主动说话：轻量 skip-history 轮（不落库/无工具/RAG） */
    async *streamProactive(
      input: StreamProactiveInput,
    ): AsyncGenerator<OrchestratorEvent> {
      yield* streamProactiveTurn(input);
    },
  };
}

export type ChatOrchestrator = ReturnType<typeof createChatOrchestrator>;
