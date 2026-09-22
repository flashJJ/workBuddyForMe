import {
  MAX_TOOL_ROUNDS,
  type TokenUsage,
  type ToolName,
  type ToolTraceEntry,
} from '@wbfm/shared';
import {
  startRun,
  traceAsync,
  type ChatMessage,
  type TraceHandle,
  type ToolCall,
} from '@wbfm/ai';
import type { ServiceDeps } from '../services/deps';
import { createAssistantsService } from '../services/assistant-service';
import { createAttachmentService } from '../services/attachment-service';
import { createConversationService } from '../services/conversation-service';
import { resolveChatTarget, type ResolvedChatTarget } from './model-resolver';
import { buildChatMessages, HISTORY_MESSAGE_LIMIT } from './prompt';
import { buildImageMap } from './multimodal';
import { prepareUserTurn } from './turn-preparation';
import { runProviderTurnWithToolFallback, type ProviderTurn } from './tool-runner';
import type { OrchestratorEvent, RagContext, StreamChatInput } from './types';
import {
  RAG_SNIPPET_LIMIT,
  ROUND_LIMIT_FALLBACK,
  isToolName,
  mergeCitations,
  normalizeFailure,
  safeParseArgs,
} from './orchestrator-helpers';
import { createToolRuntime } from '../tools/tool-runtime';
import { executeCall, summarizeArgs } from '../tools/tool-executor';
import { toToolDefinitions, type ToolResult } from '../tools/types';

export function createChatOrchestrator(deps: ServiceDeps) {
  const assistants = createAssistantsService(deps);
  const conversations = createConversationService(deps);
  const attachments = createAttachmentService(deps);
  const runtime = createToolRuntime(deps);

  return {
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
        let retrieved: RagContext | null = null;
        try {
          // 兼容路径：retrieveAlways 时保留 v0.1 每轮强制检索
          if (input.retrieve && assistant.knowledgeBaseId && assistant.retrieveAlways) {
            retrieved = await traceAsync(
              {
                name: 'knowledge_search',
                runType: 'retriever',
                parent: turnTrace,
                inputs: { query: userContent, knowledgeBaseId: assistant.knowledgeBaseId },
              },
              () => input.retrieve!(userContent, assistant, input.signal),
              (result) =>
                result
                  ? {
                      citationCount: result.citations.length,
                      citations: result.citations.map((c) => ({
                        documentId: c.documentId,
                        ordinal: c.ordinal,
                        snippet: c.snippet?.slice(0, RAG_SNIPPET_LIMIT) ?? '',
                      })),
                    }
                  : { citationCount: 0 },
            );
            if (retrieved?.citations.length) {
              yield { event: 'citations', data: { citations: retrieved.citations } };
            }
          }
        } catch (error) {
          if (input.signal?.aborted) {
            conversations.stopMessage(assistantMessage.id, '');
            yield { event: 'done', data: { content: '', usage: null } };
            return;
          }
          turnError = error;
          const failure = normalizeFailure(error);
          conversations.markMessageError(assistantMessage.id, failure.code, failure.message);
          yield { event: 'error', data: failure };
          return;
        }

        const history = conversations
          .recentMessages(conversationId, HISTORY_MESSAGE_LIMIT)
          .filter((m) => m.id !== assistantMessage.id);
        // 历史图片（含本轮新图与重生成旧图）解析为 data URL
        const imageMap = buildImageMap(attachments, history);
        const outgoing: ChatMessage[] = buildChatMessages(
          assistant,
          history,
          retrieved ?? null,
          imageMap,
        );

        const toolMap = runtime.buildTools(assistant, target.provider.supportsTools);
        const toolDefs = toToolDefinitions([...toolMap.values()]);
        const toolCtx = runtime.createContext(assistant, input.signal);
        const trace: ToolTraceEntry[] = [];
        let citations = retrieved?.citations ?? [];

        const runUnknownTool = (name: string): ToolResult => ({
          ok: false,
          output: `工具「${name}」未启用或不存在。请仅使用提供的工具，或不使用工具直接回答。`,
          summary: `未知工具：${name}`,
        });

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

            for (const call of calls) {
              const name = isToolName(call.function.name)
                ? call.function.name
                : (call.function.name as ToolName);
              const argsSummary = summarizeArgs(
                isToolName(call.function.name) ? call.function.name : 'current_time',
                safeParseArgs(call),
              );
              yield {
                event: 'tool',
                data: { phase: 'start', callId: call.id, tool: name, argsSummary },
              };

              const startedAt = Date.now();
              const tool = toolMap.get(call.function.name as ToolName);
              const result = tool
                ? await traceAsync(
                    {
                      name: `tool:${name}`,
                      runType: 'tool',
                      parent: turnTrace,
                      inputs: {
                        callId: call.id,
                        arguments: safeParseArgs(call),
                        argsSummary,
                      },
                      metadata: { tool: name },
                    },
                    () => executeCall(tool, call, toolCtx),
                    (value) => ({
                      ok: value.ok,
                      summary: value.summary,
                      durationMs: Date.now() - startedAt,
                    }),
                  )
                : runUnknownTool(call.function.name);
              const durationMs = Date.now() - startedAt;

              trace.push({
                callId: call.id,
                tool: name,
                argsSummary,
                status: result.ok ? 'ok' : 'error',
                durationMs,
                resultSummary: result.summary,
                ...(result.ok ? {} : { error: result.summary }),
                startedAt: new Date(startedAt).toISOString(),
              });
              yield {
                event: 'tool',
                data: {
                  phase: 'end',
                  callId: call.id,
                  tool: name,
                  status: result.ok ? 'ok' : 'error',
                  durationMs,
                  resultSummary: result.summary,
                  ...(result.ok ? {} : { error: result.summary }),
                },
              };

              citations = mergeCitations(citations, result.citations);
              if (result.citations?.length) {
                yield { event: 'citations', data: { citations } };
              }
              outgoing.push({
                role: 'tool',
                content: result.output,
                toolCallId: call.id,
                name: call.function.name,
              });

              if (input.signal?.aborted) {
                conversations.stopMessage(assistantMessage.id, full);
                conversations.saveMessageToolTrace(assistantMessage.id, trace);
                yield { event: 'done', data: { content: full, usage } };
                return;
              }
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
        yield { event: 'done', data: { content: full, usage } };
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
