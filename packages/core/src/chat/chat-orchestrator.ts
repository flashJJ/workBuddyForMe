import {
  HISTORY_MESSAGE_SAFETY_CAP,
  MAX_TOOL_ROUNDS,
  POST_TURN_JOBS_TIMEOUT_MS,
  type TokenUsage,
  type ToolTraceEntry,
} from '@wbfm/shared';
import { startRun, type TraceHandle, type ToolCall } from '@wbfm/ai';
import type { ServiceDeps } from '../services/deps';
import { createAssistantsService } from '../services/assistant-service';
import { createAttachmentService } from '../services/attachment-service';
import { createConversationService } from '../services/conversation-service';
import { resolveChatTarget, type ResolvedChatTarget } from './model-resolver';
import { buildTurnMessages, recordBudgetSpan } from './turn-context';
import { runAlwaysRetrieval } from './retrieve-turn';
import { runPostTurnJobs } from './post-turn-jobs';
import { createMemoryService } from '../memory/memory-service';
import { formatMemoryBlock, safeRecallEvent } from '../memory/turn-memory';
import { buildImageMap } from './multimodal';
import { prepareUserTurn } from './turn-preparation';
import { runProviderTurnWithToolFallback, type ProviderTurn } from './tool-runner';
import { runToolCallLoop } from './tool-call-loop';
import type { OrchestratorEvent, StreamChatInput } from './types';
import { ROUND_LIMIT_FALLBACK, normalizeFailure } from './orchestrator-helpers';
import { createToolRuntime } from '../tools/tool-runtime';
import { toToolDefinitions } from '../tools/types';
import { buildSkillPromptBlock, mergeSkillAllowedTools } from '../skills/skill-assembly';

export function createChatOrchestrator(deps: ServiceDeps) {
  const assistants = createAssistantsService(deps);
  const conversations = createConversationService(deps);
  const attachments = createAttachmentService(deps);
  const runtime = createToolRuntime(deps);
  const memory = createMemoryService(deps);
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

        const conversation = conversations.get(conversationId);
        const history = conversations
          .recentMessagesAfter(conversationId, conversation.summaryTurns, HISTORY_MESSAGE_SAFETY_CAP)
          .filter((m) => m.id !== assistantMessage.id);
        // 历史图片（含本轮新图与重生成旧图）解析为 data URL
        const imageMap = buildImageMap(attachments, history);

        // v0.5 M3：长期记忆召回（按助手开关门控，失败静默，命中时下发 memories 事件）
        const recalledMemories = assistant.memoryEnabled
          ? yield* safeRecallEvent({
              memory,
              query: userContent,
              signal: input.signal,
              traceParent: turnTrace,
            })
          : [];
        const memoryBlock = formatMemoryBlock(recalledMemories);

        // v0.6 M3：启用技能——提示词模板注入 system；预绑定工具与助手白名单取并集
        const enabledSkills = deps.skills?.getEnabledSkills() ?? [];
        const skillBlock = buildSkillPromptBlock(enabledSkills);
        const effectiveAssistant = mergeSkillAllowedTools(assistant, enabledSkills);

        // v0.5：先备好工具声明（计入预算扣除），再按 token 预算装配出站消息
        const toolMap = runtime.buildTools(effectiveAssistant, target.provider.supportsTools);
        const toolDefs = toToolDefinitions([...toolMap.values()]);
        const { messages: outgoing, stats: budgetStats } = buildTurnMessages({
          assistant,
          history,
          rag: retrieved ?? null,
          images: imageMap,
          contextWindow: target.model.contextWindow,
          toolDefs,
          lastCompletionTokens:
            conversations.lastAssistantUsage(conversationId)?.completionTokens ?? null,
          summary: conversation.summary,
          memoryBlock,
          skillBlock,
        });
        if (budgetStats) await recordBudgetSpan(budgetStats, turnTrace);
        // v0.7 M1：向工具上下文透传视觉能力（screen_snapshot 据此决定是否携带截图图片）
        const toolCtx = runtime.createContext(assistant, input.signal, {
          visionCapable: target.model.capabilities.includes('vision'),
        });
        const trace: ToolTraceEntry[] = [];
        let citations = retrieved?.citations ?? [];

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
        if (!input.signal?.aborted) {
          const bgController = new AbortController();
          const bgTimer = setTimeout(() => bgController.abort(), POST_TURN_JOBS_TIMEOUT_MS);
          scheduleBackgroundJob(
            runPostTurnJobs({
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
              signal: bgController.signal,
              traceParent: null,
            })
              .catch(() => undefined)
              .finally(() => clearTimeout(bgTimer)),
          );
        }
      } finally {
        await turnTrace?.end(
          { content: full, usage, aborted: Boolean(input.signal?.aborted) },
          turnError ?? undefined,
        );
      }
    },
  };
}

export type ChatOrchestrator = ReturnType<typeof createChatOrchestrator>;
