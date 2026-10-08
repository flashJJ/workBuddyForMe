import type {
  ChatChunk,
  ChatMessage,
  ChatProvider,
  EmbedParams,
  EmbedResult,
  ToolCall,
} from './types';
import type { DiscoveredModel } from '@wbfm/shared/types';
import { sleep } from './http/backoff';

/** mock 向量维度：64 维多热编码，共享 token 的文本相似度高，足以驱动真实 top-k 检索 */
const EMBED_DIMENSION = 64;
const STREAM_CHUNK_DELAY_MS = 60;
/** 用户消息命中该词时输出长回复（约 3 秒流式），供 E2E「中途停止」场景操作 */
const LONG_ANSWER_TRIGGER = /长回答|详细说说/;
/** 命中时 mock 模型发起 current_time 工具调用，用于工具链路测试 */
const TIME_TOOL_TRIGGER = /现在.*(时间|几点)|今天.*(几号|日期)|current time/i;
/**
 * v1.1 M5 eval 平台可控工具触发：消息形如 `[eval-tool:工具名] {可选参数JSON}`。
 * 首轮发起该工具调用；工具结果回灌后引用结果中的 anchor/itemCount 作答，
 * 且 promptTokens 按全部 messages 实际字符计（使工具结果压缩效果可在 usage 观察）。
 */
const EVAL_TOOL_TRIGGER = /^\[eval-tool:([^\s\]]+)](?:\s+(\{[\s\S]*\}))?\s*$/;

function hashToken(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash);
}

/** 中文按 2-gram、其余按单词切词，保证中文文本也有稳定 token */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9]+|[\u4e00-\u9fff]/g) ?? [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    const nextWord = words[i + 1];
    if (/^[\u4e00-\u9fff]$/.test(word) && nextWord && /^[\u4e00-\u9fff]$/.test(nextWord)) {
      tokens.push(word + nextWord);
      i += 1;
    } else {
      tokens.push(word);
    }
  }
  return tokens;
}

function embedText(text: string): number[] {
  const vector = new Array<number>(EMBED_DIMENSION).fill(0);
  for (const token of tokenize(text)) {
    const slot = hashToken(token) % EMBED_DIMENSION;
    vector[slot] = (vector[slot] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

function extractReference(systemContent: string): string | null {
  const marker = '【参考资料】';
  const index = systemContent.indexOf(marker);
  if (index === -1) return null;
  const block = systemContent.slice(index + marker.length).trim();
  if (!block) return null;
  // 取第一段有效内容（去掉来源行），作为“依据”回显
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => !line.startsWith('来源') && !line.startsWith('[')) ?? lines[0] ?? null;
}

/** 取最近一条 role:tool 的工具结果 */
function extractToolResult(messages: ChatMessage[], toolName: string): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    if (message.role === 'tool' && message.name === toolName) {
      return typeof message.content === 'string' ? message.content : null;
    }
  }
  return null;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function splitChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 6) {
    chunks.push(text.slice(i, i + 6));
  }
  return chunks;
}

function hasTool(params: { tools?: { function: { name: string } }[] }, name: string): boolean {
  return Boolean(params.tools?.some((tool) => tool.function.name === name));
}

/** v0.3：从 string | content parts 中取文本（视觉消息的图片片段不计入） */
function messageText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n')
      .trim();
  }
  return '';
}

function countImages(content: ChatMessage['content']): number {
  return Array.isArray(content)
    ? content.filter((part) => part.type === 'image_url').length
    : 0;
}

function toolCallChunk(call: ToolCall): ChatChunk {
  return { delta: '', toolCalls: [call], finishReason: 'tool_calls' };
}

/**
 * 进程内 mock 供应商（WBFM_MOCK_AI=1 时由 core 注入）：
 * chatStream 回显用户问题/参考资料，embed 用确定性伪语义向量驱动真实检索链路；
 * supportsTools=true：时间类提问且授权了 current_time 时，走一次完整工具循环。
 */
export function createMockProvider(): ChatProvider {
  return {
    supportsTools: true,

    async testConnection(): Promise<void> {
      return undefined;
    },

    async listModels(): Promise<DiscoveredModel[]> {
      return [
        { id: 'mock-chat', contextLength: null },
        { id: 'mock-embed', contextLength: null },
      ];
    },

    async *chatStream(params): AsyncIterable<ChatChunk> {
      const system = params.messages.find((message) => message.role === 'system');
      const user = [...params.messages].reverse().find((message) => message.role === 'user');
      const userText = messageText(user?.content ?? '');
      const imageCount = countImages(user?.content ?? '');
      const reference = extractReference(messageText(system?.content ?? ''));

      // v0.3：mock 视觉——用户消息带图片时给出确定性「看图」回复，驱动 E2E 全链路
      if (imageCount > 0) {
        const reply = `（mock 视觉模型）已查看 ${imageCount} 张图片。${
          userText ? `你的问题是：${truncate(userText, 40)}。` : '你未附带文字说明。'
        }图片内容看起来是一张可识别的截图。`;
        yield { delta: reply };
        yield { delta: '', usage: { promptTokens: 120, completionTokens: 24, totalTokens: 144 } };
        return;
      }

      // v1.1 M5 eval 可控工具：[eval-tool:名称] → 首轮调用/次轮引用结果
      const evalMatch = userText.match(EVAL_TOOL_TRIGGER);
      if (evalMatch) {
        const evalToolName = evalMatch[1]!;
        if (hasTool(params, evalToolName)) {
          const evalToolResult = extractToolResult(params.messages, evalToolName);
          if (!evalToolResult) {
            let args: Record<string, unknown> = {};
            if (evalMatch[2]) {
              try {
                args = JSON.parse(evalMatch[2]) as Record<string, unknown>;
              } catch {
                args = {};
              }
            }
            yield toolCallChunk({
              id: 'call-eval-tool',
              type: 'function',
              function: { name: evalToolName, arguments: JSON.stringify(args) },
            });
            return;
          }
          // 二次引用：答案必须从工具结果（压缩视图）取 anchor/itemCount，
          // 读到即证明压缩保留了后续工具引用所需身份字段；promptTokens 按全部
          // messages 实计，使入模压缩量直接反映在 done.usage 上。
          const anchor = evalToolResult.match(/"id"\s*:\s*"([^"]+)"/)?.[1] ?? '?';
          const omitted = evalToolResult.match(/"__omitted"\s*:\s*(\d+)/)?.[1] ?? '0';
          const reply = `eval 引用完成：anchor=${anchor}，omitted=${omitted}`;
          const promptTokens = Math.max(
            5,
            Math.ceil(params.messages.map((m) => messageText(m.content)).join('').length / 4),
          );
          yield {
            delta: reply,
            usage: { promptTokens, completionTokens: 12, totalTokens: promptTokens + 12 },
          };
          return;
        }
      }

      // 工具循环：首轮请求时间 → 发起 current_time 调用；工具结果回灌后 → 作答
      if (hasTool(params, 'current_time') && TIME_TOOL_TRIGGER.test(userText)) {
        const toolResult = extractToolResult(params.messages, 'current_time');
        if (!toolResult) {
          yield toolCallChunk({
            id: 'call-mock-time',
            type: 'function',
            function: { name: 'current_time', arguments: '{}' },
          });
          return;
        }
        yield { delta: `现在是 ${toolResult}。` };
        yield { delta: '', usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 } };
        return;
      }

      const reply = reference
        ? `根据检索到的资料：${truncate(reference, 60)}。以上回答依据知识库中的相关内容给出。`
        : LONG_ANSWER_TRIGGER.test(userText)
          ? `好的，下面给出一段较长的回答。${'工作台规划分为三步：先整理资料，再配置助手，最后验证效果。'.repeat(10)}`
          : `你好，我是 mock 模型。收到你的消息：「${truncate(userText, 40)}」。`;

      const promptTokens = 5 + Math.floor(messageText(system?.content ?? '').length / 4);
      const chunks = splitChunks(reply);
      for (const [index, chunk] of chunks.entries()) {
        if (params.signal?.aborted) return;
        if (index > 0) await sleep(STREAM_CHUNK_DELAY_MS, params.signal);
        yield { delta: chunk };
      }
      yield {
        delta: '',
        usage: {
          promptTokens,
          completionTokens: chunks.length,
          totalTokens: promptTokens + chunks.length,
        },
      };
    },

    async embed(params: EmbedParams): Promise<EmbedResult> {
      return {
        vectors: params.input.map((text) => embedText(text)),
        dimension: EMBED_DIMENSION,
      };
    },
  };
}

export const MOCK_CHAT_MODEL = 'mock-chat';
export const MOCK_EMBED_MODEL = 'mock-embed';
export type { ChatMessage };
