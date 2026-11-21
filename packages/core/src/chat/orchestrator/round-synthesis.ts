import type { TokenUsage } from '@wbfm/shared/api';
import type { ChatMessage, TraceHandle } from '@wbfm/ai';
import type { Assistant } from '@wbfm/shared/types';
import type { ResolvedChatTarget } from '../context/model-resolver';
import type { OrchestratorEvent } from '../base/types';
import { runProviderTurnWithToolFallback } from '../tools/tool-runner';
import { ROUND_LIMIT_FALLBACK } from './orchestrator-helpers';

/** 工具轮用尽后的收尾指令：不带工具，强制基于已有结果成文 */
export const ROUND_SYNTHESIS_PROMPT =
  '工具调用轮数已用尽。请只基于上文已获得的工具结果直接给出最终回答，不要再调用工具；若信息仍不足，请说明还缺什么。';

/**
 * v2.23：工具轮耗尽且正文为空时的收尾轮。
 *
 * 背景：搜索类任务往往前几轮全在调工具（模型只回 tool_calls、不带文本），
 * 轮数一到就只剩「未能形成回答」的兜底文案，白花了搜索与 token。
 * 这里追加一条收尾指令并以 tools=[] 再调一次模型，让已收集的结果转成回答；
 * 只有连收尾轮都拿不到文本时，调用方才退回 ROUND_LIMIT_FALLBACK。
 */
export async function* synthesizeFinalAnswer(input: {
  target: ResolvedChatTarget;
  assistant: Assistant;
  outgoing: ChatMessage[];
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}): AsyncGenerator<OrchestratorEvent, { content: string; usage: TokenUsage | null }> {
  let content = '';
  let usage: TokenUsage | null = null;
  const turn = runProviderTurnWithToolFallback({
    target: input.target,
    assistant: input.assistant,
    messages: [...input.outgoing, { role: 'user', content: ROUND_SYNTHESIS_PROMPT }],
    tools: [],
    signal: input.signal,
    traceParent: input.traceParent ?? null,
  });
  while (true) {
    const step = await turn.next();
    if (step.done) {
      usage = step.value.usage;
      break;
    }
    if (step.value.event === 'delta') content += step.value.data.content;
    yield step.value;
  }
  // 连收尾轮都拿不到正文时才退回兜底文案（由 done 事件带给前端）
  return { content: content.trim() ? content : ROUND_LIMIT_FALLBACK, usage };
}

/**
 * 工具循环结束后的收尾决策：
 * - 正文为空（模型只回 tool_calls）→ 收尾轮成文；
 * - 轮数耗尽且最后一轮仍有未执行调用（hitRoundLimit）→ 即使已有过程旁白也必须收尾，
 *   否则回合会静默截断在「我再查一下」，看起来像没跑完；
 * - 正常产出正文且未触顶 → 原样返回，不额外调用模型。
 */
export async function* finishWithSynthesis(input: {
  target: ResolvedChatTarget;
  assistant: Assistant;
  outgoing: ChatMessage[];
  full: string;
  hitRoundLimit: boolean;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}): AsyncGenerator<OrchestratorEvent, { content: string; usage: TokenUsage | null }> {
  if (!input.hitRoundLimit && input.full.trim()) return { content: input.full, usage: null };
  const answer = yield* synthesizeFinalAnswer({
    target: input.target,
    assistant: input.assistant,
    outgoing: input.outgoing,
    signal: input.signal,
    traceParent: input.traceParent,
  });
  const prefix = input.hitRoundLimit && input.full.trim() ? `${input.full.trimEnd()}\n\n` : input.full;
  return { content: prefix + answer.content, usage: answer.usage };
}
