import type { ChatChunk, ChatMessage } from '../types';
import { ProviderError } from '../errors/provider-error';
import { extractToolResult, messageText } from './message-utils';

/**
 * v4.18 M5：mock 供应商的离线 eval 探针（仅 WBFM_MOCK_AI 生效，零外网）。
 *
 * - `[eval-tool:工具名] {参数}`：首轮发起工具调用；工具结果回灌后引用压缩视图的 anchor/omitted；
 * - `[eval-replay] memory=标记|标记;citation=…;constraint=…`：读取真实入模消息，
 *   回报关键标记是否仍在上下文里，供 eval-replay 计算记忆/引用/约束保留率。
 */

const EVAL_TOOL_TRIGGER = /^\[eval-tool:([^\s\]]+)](?:\s+(\{[\s\S]*\}))?\s*$/;
const EVAL_REPLAY_TRIGGER = /^\[eval-replay]\s*(.+)$/;
/** v4.18 M6：E2E 故障注入，形如 `[eval-fail:mock-chat:429]`，仅对指定 modelId 生效 */
const EVAL_FAIL_TRIGGER = /\[eval-fail:([^:\]\s]+):(\d{3})]/;

/** 回放探针的分组作用域：记忆允许出现在历史，引用/约束只认 system 区块 */
const REPLAY_GROUP_SCOPE: Record<string, 'system' | 'any'> = {
  memory: 'any',
  citation: 'system',
  constraint: 'system',
};

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === 'user') return i;
  }
  return -1;
}

export interface EvalToolProbeInput {
  messages: ChatMessage[];
  userText: string;
  hasTool: (name: string) => boolean;
}

/**
 * `[eval-tool:名称]`：首轮发起调用；次轮引用结果中的首个 id 与 __omitted 标记。
 * 未命中触发格式或工具未授权时返回 null，调用方继续走常规剧本。
 */
export function runEvalToolProbe(input: EvalToolProbeInput): ChatChunk[] | null {
  const match = input.userText.match(EVAL_TOOL_TRIGGER);
  if (!match) return null;
  const toolName = match[1]!;
  if (!input.hasTool(toolName)) return null;

  const result = extractToolResult(input.messages, toolName);
  if (!result) {
    let args: Record<string, unknown> = {};
    if (match[2]) {
      try {
        args = JSON.parse(match[2]) as Record<string, unknown>;
      } catch {
        args = {};
      }
    }
    return [
      {
        delta: '',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-eval-tool',
            type: 'function',
            function: { name: toolName, arguments: JSON.stringify(args) },
          },
        ],
      },
    ];
  }

  const anchor = result.match(/"id"\s*:\s*"([^"]+)"/)?.[1] ?? '?';
  const omitted = result.match(/"__omitted"\s*:\s*(\d+)/)?.[1] ?? '0';
  const reply = `eval 引用完成：anchor=${anchor}，omitted=${omitted}`;
  const promptTokens = Math.max(
    5,
    Math.ceil(input.messages.map((message) => messageText(message.content)).join('').length / 4),
  );
  return [
    { delta: reply },
    { delta: '', usage: { promptTokens, completionTokens: 12, totalTokens: promptTokens + 12 } },
  ];
}

/**
 * `[eval-fail:模型ID:HTTP状态]`：只对指定模型注入一次上游失败，供 E2E 验证自动切换。
 * 未命中或 modelId 不匹配返回 null；备用模型看到同一消息不会再次失败。
 */
export function runFaultProbe(model: string, userText: string): ProviderError | null {
  const match = userText.match(EVAL_FAIL_TRIGGER);
  if (!match || match[1] !== model) return null;
  const status = Number(match[2]);
  return new ProviderError({
    code: 'PROVIDER_ERROR',
    status,
    providerMessage: `eval-fail injected HTTP ${status}`,
    message: `mock 供应商按 eval 指令返回 HTTP ${status}`,
    retriable: status === 429 || status >= 500,
  });
}

interface ReplayGroup {
  group: string;
  markers: string[];
}

/** 解析 `group=标记|标记;group=…`；格式不完整的分组直接丢弃 */
function parseReplayGroups(spec: string): ReplayGroup[] {
  const groups: ReplayGroup[] = [];
  for (const part of spec.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const group = part.slice(0, eq).trim();
    const markers = part
      .slice(eq + 1)
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    if (group && markers.length > 0) groups.push({ group, markers });
  }
  return groups;
}

/**
 * `[eval-replay]`：按分组回报标记是否还在本次请求的真实消息里。
 * 探针自身（最后一条 user 消息）不参与 `any` 作用域，避免标记自证。
 * @returns 形如 `eval-replay {"memory":[1,0]}` 的回复块
 */
export function runReplayProbe(messages: ChatMessage[], userText: string): ChatChunk[] | null {
  const match = userText.match(EVAL_REPLAY_TRIGGER);
  if (!match) return null;
  const groups = parseReplayGroups(match[1] ?? '');
  if (groups.length === 0) return [{ delta: 'eval-replay {}' }];

  const systemText = messages
    .filter((message) => message.role === 'system')
    .map((message) => messageText(message.content))
    .join('\n');
  const probeIndex = lastUserIndex(messages);
  const historyText = messages
    .filter((message, index) => message.role !== 'system' && index !== probeIndex)
    .map((message) => messageText(message.content))
    .join('\n');

  const result: Record<string, number[]> = {};
  for (const { group, markers } of groups) {
    const source = REPLAY_GROUP_SCOPE[group] === 'system' ? systemText : `${systemText}\n${historyText}`;
    result[group] = markers.map((marker) => (source.includes(marker) ? 1 : 0));
  }
  return [
    { delta: `eval-replay ${JSON.stringify(result)}` },
    { delta: '', usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 } },
  ];
}
