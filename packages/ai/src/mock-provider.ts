import type {
  ChatChunk,
  ChatMessage,
  ChatProvider,
  EmbedParams,
  EmbedResult,
} from './types';
import { sleep } from './http/backoff';

/** mock 向量维度：64 维多热编码，共享 token 的文本相似度高，足以驱动真实 top-k 检索 */
const EMBED_DIMENSION = 64;
const STREAM_CHUNK_DELAY_MS = 60;
/** 用户消息命中该词时输出长回复（约 3 秒流式），供 E2E「中途停止」场景操作 */
const LONG_ANSWER_TRIGGER = /长回答|详细说说/;

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

/**
 * 进程内 mock 供应商（WBFM_MOCK_AI=1 时由 core 注入）：
 * chatStream 回显用户问题/参考资料，embed 用确定性伪语义向量驱动真实检索链路。
 */
export function createMockProvider(): ChatProvider {
  return {
    async testConnection(): Promise<void> {
      return undefined;
    },

    async listModels(): Promise<string[]> {
      return ['mock-chat', 'mock-embed'];
    },

    async *chatStream(params): AsyncIterable<ChatChunk> {
      const system = params.messages.find((message) => message.role === 'system');
      const user = [...params.messages].reverse().find((message) => message.role === 'user');
      const reference = extractReference(system?.content ?? '');

      const reply = reference
        ? `根据检索到的资料：${truncate(reference, 60)}。以上回答依据知识库中的相关内容给出。`
        : LONG_ANSWER_TRIGGER.test(user?.content ?? '')
          ? `好的，下面给出一段较长的回答。${'工作台规划分为三步：先整理资料，再配置助手，最后验证效果。'.repeat(10)}`
          : `你好，我是 mock 模型。收到你的消息：「${truncate(user?.content ?? '', 40)}」。`;

      const promptTokens = 5 + Math.floor((system?.content.length ?? 0) / 4);
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
