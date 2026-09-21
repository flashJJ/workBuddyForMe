import {
  ApiError,
  MAX_TOOL_ROUNDS,
  TOOL_NAMES,
  type Citation,
  type TokenUsage,
  type ToolName,
  type ToolTraceEntry,
} from '@wbfm/shared';
import { ProviderError, type ChatMessage, type ToolCall } from '@wbfm/ai';
import type { ServiceDeps } from '../services/deps';
import { createAssistantsService } from '../services/assistant-service';
import { createConversationService } from '../services/conversation-service';
import { resolveChatTarget } from './model-resolver';
import { buildChatMessages, HISTORY_MESSAGE_LIMIT } from './prompt';
import { runProviderTurn, type ProviderTurn } from './tool-runner';
import type { OrchestratorEvent, RagContext, StreamChatInput } from './types';
import { createToolRuntime } from '../tools/tool-runtime';
import { executeCall, parseToolArgs, summarizeArgs } from '../tools/tool-executor';
import { toToolDefinitions, type ToolResult } from '../tools/types';

const ROUND_LIMIT_FALLBACK = '（工具调用已达轮数上限，未能形成回答，请换个问法再试一次。）';

function normalizeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof ProviderError) return { code: error.code, message: error.message };
  return { code: 'INTERNAL_ERROR', message: '对话生成失败，请稍后重试' };
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

function mergeCitations(existing: Citation[], incoming: Citation[] | undefined): Citation[] {
  if (!incoming || incoming.length === 0) return existing;
  const seen = new Set(existing.map((c) => `${c.documentId}:${c.ordinal}`));
  const merged = [...existing];
  for (const citation of incoming) {
    const key = `${citation.documentId}:${citation.ordinal}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(citation);
    }
  }
  return merged;
}

export function createChatOrchestrator(deps: ServiceDeps) {
  const assistants = createAssistantsService(deps);
  const conversations = createConversationService(deps);
  const runtime = createToolRuntime(deps);

  return {
    async *streamChat(input: StreamChatInput): AsyncGenerator<OrchestratorEvent> {
      const assistant = assistants.get(input.assistantId);

      let conversationId: string;
      let userContent: string;
      try {
        if (input.regenerate) {
          if (!input.conversationId) throw ApiError.validation('重新生成需要已有会话');
          conversationId = input.conversationId;
          conversations.get(conversationId);
          userContent = conversations.prepareRegenerate(conversationId);
        } else {
          const conversation = input.conversationId
            ? conversations.get(input.conversationId)
            : conversations.create(assistant.id);
          conversationId = conversation.id;
          conversations.appendMessage({ conversationId, role: 'user', content: input.content });
          userContent = input.content;
        }
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

      let target;
      let retrieved: RagContext | null = null;
      try {
        target = resolveChatTarget(deps, assistant);
        // 兼容路径：retrieveAlways 时保留 v0.1 每轮强制检索
        if (input.retrieve && assistant.knowledgeBaseId && assistant.retrieveAlways) {
          retrieved = await input.retrieve(userContent, assistant, input.signal);
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
        const failure = normalizeFailure(error);
        conversations.markMessageError(assistantMessage.id, failure.code, failure.message);
        yield { event: 'error', data: failure };
        return;
      }

      const history = conversations
        .recentMessages(conversationId, HISTORY_MESSAGE_LIMIT)
        .filter((m) => m.id !== assistantMessage.id);
      const outgoing: ChatMessage[] = buildChatMessages(assistant, history, retrieved ?? null);

      const toolMap = runtime.buildTools(assistant, target.provider.supportsTools);
      const toolDefs = toToolDefinitions([...toolMap.values()]);
      const toolCtx = runtime.createContext(assistant, input.signal);
      const trace: ToolTraceEntry[] = [];
      let citations = retrieved?.citations ?? [];
      let full = '';
      let usage: TokenUsage | null = null;

      const runUnknownTool = (name: string): ToolResult => ({
        ok: false,
        output: `工具「${name}」未启用或不存在。请仅使用提供的工具，或不使用工具直接回答。`,
        summary: `未知工具：${name}`,
      });

      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
          // 手动迭代：delta 直接累积到 full，保证中途 abort 也能保留已产出片段
          const turn = runProviderTurn({
            target,
            assistant,
            messages: outgoing,
            tools: toolDefs,
            signal: input.signal,
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
            const name = isToolName(call.function.name) ? call.function.name : (call.function.name as ToolName);
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
              ? await executeCall(tool, call, toolCtx)
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
          }

          if (input.signal?.aborted) {
            conversations.stopMessage(assistantMessage.id, full);
            conversations.saveMessageToolTrace(assistantMessage.id, trace);
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
        const failure = normalizeFailure(error);
        conversations.markMessageError(assistantMessage.id, failure.code, failure.message);
        conversations.saveMessageToolTrace(assistantMessage.id, trace);
        yield { event: 'error', data: failure };
        return;
      }

      conversations.completeMessage(assistantMessage.id, full, usage);
      conversations.saveMessageToolTrace(assistantMessage.id, trace);
      yield { event: 'done', data: { content: full, usage } };
    },
  };
}

/** 仅用于界面摘要的宽容解析，失败返回空对象 */
function safeParseArgs(call: ToolCall): unknown {
  try {
    return parseToolArgs(call);
  } catch {
    return {};
  }
}

export type ChatOrchestrator = ReturnType<typeof createChatOrchestrator>;
