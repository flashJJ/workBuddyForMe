import type { ChatChunk, ChatMessage, ChatParams, TokenUsage } from './types';
import { ProviderError } from './errors/provider-error';
import { sleep } from './http/backoff';

/**
 * v4.11 P0：场景化 mock 供应商（离线全链路验收）。
 *
 * 只编程「模型的决策」，不编程「系统的行为」：
 * 场景文件按轮下发 toolCalls / 延迟 / 错误，编排、权限、预算、抓取全部走真实代码。
 * 触发方式沿用 eval 文化：用户消息形如 `[scenario:案例名] 正文`。
 */

export interface MockScenarioToolCall {
  name: string;
  args?: Record<string, unknown>;
  /** 缺省由运行器生成唯一 id */
  id?: string;
}

export interface MockScenarioTurn {
  /** 最终回答文本；支持 {{toolState}} 探针展开（模型实际看到的工具消息状态） */
  content?: string;
  toolCalls?: MockScenarioToolCall[];
  /** 模型「思考」延迟，用于时序类断言 */
  delayMs?: number;
  usage?: TokenUsage;
  /** 注入一次上游错误；同一轮第二次调用自动恢复 */
  error?: { type: 'context_overflow' };
}

export interface MockScenarioCase {
  turns: MockScenarioTurn[];
}

export interface MockScenarioFile {
  /** 缺省 `[scenario:` */
  triggerPrefix?: string;
  scenarios: Record<string, MockScenarioCase>;
}

export const DEFAULT_SCENARIO_TRIGGER = '[scenario:';
/** 与 tool-result-budget 的折叠标记保持一致的前缀 */
const FOLDED_MARKER = '较早的工具结果已折叠';

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === 'user') return i;
  }
  return -1;
}

/** 当前用户轮内的模型调用序号（0 = 首次请求） */
export function scenarioRound(messages: ChatMessage[]): number {
  const start = lastUserIndex(messages);
  let round = 0;
  for (let i = start + 1; i < messages.length; i += 1) {
    if (messages[i]!.role === 'assistant') round += 1;
  }
  return round;
}

/**
 * 模型实际看到的工具消息状态（探针）：折叠与否、长度、顺序。
 * 用它把「上下文预算是否生效」变成模型自述，可在 SSE 终稿中断言。
 */
export function toolStateProbe(messages: ChatMessage[]): string {
  const tools = messages.filter((message) => message.role === 'tool');
  return JSON.stringify({
    count: tools.length,
    tools: tools.map((message) => {
      const text = typeof message.content === 'string' ? message.content : '';
      return {
        name: message.name ?? '',
        chars: text.length,
        folded: text.includes(FOLDED_MARKER),
      };
    }),
  });
}

function renderContent(content: string, messages: ChatMessage[]): string {
  return content.replaceAll('{{toolState}}', toolStateProbe(messages));
}

function matchScenario(
  userText: string,
  file: MockScenarioFile,
): { name: string; turns: MockScenarioTurn[] } | null {
  const prefix = file.triggerPrefix ?? DEFAULT_SCENARIO_TRIGGER;
  const start = userText.indexOf(prefix);
  if (start === -1) return null;
  const end = userText.indexOf(']', start + prefix.length);
  if (end === -1) return null;
  const name = userText.slice(start + prefix.length, end).trim();
  const scenario = file.scenarios[name];
  return scenario ? { name, turns: scenario.turns } : null;
}

function hasTool(params: ChatParams, name: string): boolean {
  return Boolean(params.tools?.some((tool) => tool.function.name === name));
}

function estimatePromptTokens(messages: ChatMessage[]): number {
  const chars = messages.reduce((sum, message) => {
    if (typeof message.content === 'string') return sum + message.content.length;
    if (Array.isArray(message.content)) {
      return sum + message.content.reduce((inner, part) => inner + (part.type === 'text' ? part.text.length : 0), 0);
    }
    return sum;
  }, 0);
  return Math.max(5, Math.ceil(chars / 4));
}

function usageOf(turn: MockScenarioTurn, messages: ChatMessage[]): TokenUsage {
  const promptTokens = estimatePromptTokens(messages);
  const completionTokens = 20;
  return turn.usage ?? {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export interface MockScenarioRuntime {
  /** 命中场景返回 true；未命中返回 false（调用方继续走原有剧本） */
  reply(params: ChatParams, userText: string): AsyncGenerator<ChatChunk, boolean>;
}

/** 每个 provider 实例一份运行态：错误注入的「只失败一次」按实例隔离 */
export function createScenarioRuntime(file: MockScenarioFile): MockScenarioRuntime {
  const attempts = new Map<string, number>();

  async function* reply(params: ChatParams, userText: string): AsyncGenerator<ChatChunk, boolean> {
    const matched = matchScenario(userText, file);
    if (!matched) return false;

    const round = scenarioRound(params.messages);
    const turn = matched.turns[round];
    // 场景结束（模型不再调用工具）时给一句收尾，避免工具循环空转
    if (!turn) {
      const content = matched.turns.at(-1)?.content ?? '（场景结束）';
      yield { delta: renderContent(content, params.messages) };
      return true;
    }

    if (turn.delayMs && turn.delayMs > 0) await sleep(turn.delayMs, params.signal);

    if (turn.error) {
      const key = `${matched.name}:${round}`;
      const attempt = attempts.get(key) ?? 0;
      attempts.set(key, attempt + 1);
      if (attempt === 0) {
        throw new ProviderError({
          code: 'PROVIDER_ERROR',
          status: 400,
          providerMessage: 'context_length_exceeded',
          message: '上游返回 400（context_length_exceeded）：场景注入的上下文超限',
        });
      }
    }

    const calls = (turn.toolCalls ?? []).filter((call) => hasTool(params, call.name));
    if (calls.length > 0) {
      yield {
        delta: '',
        finishReason: 'tool_calls',
        toolCalls: calls.map((call, index) => ({
          id: call.id ?? `${matched.name}-${round}-${index}`,
          type: 'function' as const,
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        })),
      };
      return true;
    }

    const content = renderContent(turn.content ?? '（场景完成）', params.messages);
    yield { delta: content, usage: usageOf(turn, params.messages) };
    return true;
  }

  return { reply };
}
