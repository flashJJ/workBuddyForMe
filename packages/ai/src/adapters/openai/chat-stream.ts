import type { ChatChunk, ChatParams, ProviderConnection } from '../../types';
import { openSseChannel } from '../../http/sse-channel';
import { parseSse } from '../../http/sse-parser';
import { OPENAI_ENDPOINTS, joinEndpoint } from './url';
import { DONE_MARKER, buildChatBody, mapUsage, type ChatCompletionChunk } from './payloads';

/**
 * OpenAI 兼容 /chat/completions SSE 增量流。
 * 调用方通过 params.signal 取消时，底层请求与响应体一并中断。
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
    },
  );

  try {
    for await (const event of parseSse(response.body!)) {
      if (event.data === DONE_MARKER) break;
      const chunk = parseChunk(event.data);
      if (!chunk) continue;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield { delta };
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
