import type { ChatChunk, ChatParams, ProviderConnection } from '../../types';
import { openSseChannel } from '../../http/sse-channel';
import { parseSse } from '../../http/sse-parser';
import { CHAT_CONNECT_TIMEOUT_MS } from '@wbfm/shared';
import { OPENAI_ENDPOINTS, joinEndpoint } from './url';
import {
  DONE_MARKER,
  ToolCallAccumulator,
  buildChatBody,
  mapUsage,
  type ChatCompletionChunk,
} from './payloads';

/**
 * OpenAI 兼容 /chat/completions SSE 增量流。
 * - content 增量实时产出（打字机）；
 * - tool_calls 增量在适配器内按 index 拼装，finish_reason=tool_calls 时整体产出一次；
 * - 调用方通过 params.signal 取消时，底层请求与响应体一并中断。
 */
export async function* openAiChatStream(
  connection: ProviderConnection,
  params: ChatParams,
): AsyncIterable<ChatChunk> {
  const { response, dispose } = await openSseChannel(
    joinEndpoint(connection.baseUrl, OPENAI_ENDPOINTS.chatCompletions),
    {
      apiKey: connection.apiKey,
      signal: params.signal,
      body: buildChatBody(params),
      // 本地模型冷加载首字节慢，连接超时放宽到 180s（仅覆盖响应头到达前）
      timeoutMs: CHAT_CONNECT_TIMEOUT_MS,
    },
  );

  const toolCalls = new ToolCallAccumulator();
  try {
    for await (const event of parseSse(response.body!)) {
      if (event.data === DONE_MARKER) break;
      const chunk = parseChunk(event.data);
      if (!chunk) continue;
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) yield { delta };
      toolCalls.absorb(choice?.delta?.tool_calls);
      if (choice?.finish_reason) {
        if (choice.finish_reason === 'tool_calls') {
          yield { delta: '', toolCalls: toolCalls.assemble(), finishReason: 'tool_calls' };
        } else if (choice.finish_reason !== 'stop') {
          yield { delta: '', finishReason: choice.finish_reason };
        }
      }
      if (chunk.usage) yield { delta: '', usage: mapUsage(chunk.usage) };
    }
  } finally {
    // 消费者提前 break / abort 时取消上游响应体并解绑信号，避免悬挂连接
    await response.body?.cancel().catch(() => undefined);
    dispose();
  }
}

function parseChunk(data: string): ChatCompletionChunk | null {
  try {
    return JSON.parse(data) as ChatCompletionChunk;
  } catch {
    return null;
  }
}
