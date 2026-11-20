import type { ChatChunk, ChatParams, ProviderConnection } from '../../types';
import { CHAT_CONNECT_TIMEOUT_MS, CHAT_STREAM_IDLE_TIMEOUT_MS } from '@wbfm/shared/constants';
import { ProviderError } from '../../errors/provider-error';
import { openSseChannel } from '../../http/sse-channel';
import { parseSse } from '../../http/sse-parser';
import { OPENAI_ENDPOINTS, joinEndpoint } from './url';
import {
  DONE_MARKER,
  ToolCallAccumulator,
  buildChatBody,
  mapUsage,
  type ChatCompletionChunk,
} from './payloads';
import { createWireToolNameCodec } from './tool-name-codec';

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
  // 限定名转义为上游接受的字符集；回包工具调用再还原为内部名
  const codec = createWireToolNameCodec(params);
  // 空闲看门狗必须走 AbortSignal 中止请求：parseSse 已用 reader 锁定 response.body，
  // 对锁定流调用 body.cancel() 只会抛 TypeError（被吞掉），看门狗等于没有生效。
  const idle = new AbortController();
  const streamSignal = params.signal
    ? AbortSignal.any([params.signal, idle.signal])
    : idle.signal;
  const { response, dispose } = await openSseChannel(
    joinEndpoint(connection.baseUrl, OPENAI_ENDPOINTS.chatCompletions),
    {
      apiKey: connection.apiKey,
      signal: streamSignal,
      body: buildChatBody(params, codec),
      // 本地模型冷加载首字节慢，连接超时放宽到 180s（仅覆盖响应头到达前）
      timeoutMs: CHAT_CONNECT_TIMEOUT_MS,
    },
  );

  const toolCalls = new ToolCallAccumulator();
  // 块间空闲看门狗：连接建立后若长时间无任何增量（本地模型高负载/上游僵死），
  // 主动中止并归一化为可重试超时，避免读取循环无限等待、UI 永久转圈。
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  const armIdle = (abort: () => void) => {
    clearIdle();
    idleTimer = setTimeout(abort, CHAT_STREAM_IDLE_TIMEOUT_MS);
  };
  try {
    const abortIdle = () => {
      clearIdle();
      idle.abort();
    };
    armIdle(abortIdle);
    for await (const event of parseSse(response.body!)) {
      armIdle(abortIdle); // 每收到一个 SSE 事件就重置空闲计时
      if (event.data === DONE_MARKER) break;
      const chunk = parseChunk(event.data);
      if (!chunk) continue;
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) yield { delta };
      toolCalls.absorb(choice?.delta?.tool_calls);
      if (choice?.finish_reason) {
        if (choice.finish_reason === 'tool_calls') {
          const restored = toolCalls.assemble().map((call) => ({
            ...call,
            function: { ...call.function, name: codec.toOriginal(call.function.name) },
          }));
          yield { delta: '', toolCalls: restored, finishReason: 'tool_calls' };
        } else if (choice.finish_reason !== 'stop') {
          yield { delta: '', finishReason: choice.finish_reason };
        }
      }
      if (chunk.usage) yield { delta: '', usage: mapUsage(chunk.usage) };
    }
  } catch (error) {
    // 空闲看门狗触发：idle 中止会让底层读取抛 AbortError，且并非调用方主动取消
    if (!params.signal?.aborted && idle.signal.aborted) {
      throw ProviderError.timeout(
        `SSE 流式读取 ${joinEndpoint(connection.baseUrl, OPENAI_ENDPOINTS.chatCompletions)}`,
        CHAT_STREAM_IDLE_TIMEOUT_MS,
      );
    }
    throw error;
  } finally {
    clearIdle();
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
