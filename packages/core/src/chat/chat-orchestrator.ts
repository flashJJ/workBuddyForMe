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
import type { OrchestratorEvent, StreamChatInput } from './types';
import { ROUND_LIMIT_FALLBACK, normalizeFailure } from './orchestrator-helpers';
import { createToolRuntime } from '../tools/tool-runtime';
import { createMemoryService } from '../memory/memory-service';
import { prepareTurnContext, type PreparedTurnContext } from './turn-context-assembly';
import { schedulePostTurnJobs } from './post-turn-schedule';

export function createChatOrchestrator(deps: ServiceDeps) {
  const assistants = createAssistantsService(deps);
  const conversations = createConversationService(deps);
  const attachments = createAttachmentService(deps);
  const runtime = createToolRuntime(deps);
  const memory = createMemoryService(deps);
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
              turnTrace,
              trace,
              outgoing,
              citations,
              toolMessageBudgetTokens,
              signal: input.signal,
              onAbort: () => {
                conversations.stopMessage(assistantMessage.id, full);
                conversations.saveMessageToolTrace(assistantMessage.id, trace);
              },
            });
            citations = loopOutcome.citations;
            if (loopOutcome.aborted) {
              yield { event: 'done', data: { content: full, usage } };
              return;
            }
          }

          if (!full.trim()) {
            full = ROUND_LIMIT_FALLBACK;
            yield { event: 'delta', data: { content: full } };
          }
        } catch (error) {
          if (input.signal?.aborted) {
            conversations.stopMessage(assistantMessage.id, full);
            conversations.saveMessageToolTrace(assistantMessage.id, trace);
            yield { event: 'done', data: { content: full, usage } };
            return;
          }
          turnError = error;
          const failure = normalizeFailure(error);
          conversations.markMessageError(assistantMessage.id, failure.code, failure.message);
          conversations.saveMessageToolTrace(assistantMessage.id, trace);
          yield { event: 'error', data: failure };
          return;
        }

        conversations.completeMessage(assistantMessage.id, full, usage);
        conversations.saveMessageToolTrace(assistantMessage.id, trace);

        // 先把 done 交给用户：回答已完整落库，UI 立即结束 loading。
        // 摘要压缩/长期记忆是旁路 LLM 任务（本地 14B 上可能再花十几秒），
        // 绝不能阻塞 done——否则会出现「文字已出完但停止生成一直转」。
        yield { event: 'done', data: { content: full, usage } };

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
