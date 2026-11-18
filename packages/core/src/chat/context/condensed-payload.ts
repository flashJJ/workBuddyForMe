import type { ContextCondensedPayload } from '@wbfm/shared/schemas';

/**
 * v4.8 真机验收修正：压缩事件按契约上限裁剪。
 * 真实长对话的 fidelityMissing/facts 可能超出 schema 的 max 限制，
 * 未裁剪会令前端 safeParse 失败并整条丢弃（面板显示「尚未触发压缩」）。
 * 这里只裁观测载荷，不影响已写回的 conversations 摘要与事实。
 */
export function clipCondensedPayload(payload: ContextCondensedPayload): ContextCondensedPayload {
  const clip = (text: string, max: number): string => text.slice(0, max);
  return {
    ...payload,
    summary: clip(payload.summary, 8000),
    foldedMessageIds: payload.foldedMessageIds.slice(0, 500),
    facts: payload.facts.slice(0, 20).map((fact) => ({
      key: clip(fact.key, 80),
      value: clip(fact.value, 400),
    })),
    decisions: payload.decisions.slice(0, 10).map((item) => clip(item, 300)),
    openLoops: payload.openLoops.slice(0, 10).map((item) => clip(item, 300)),
    fidelityMissing: payload.fidelityMissing.slice(0, 20),
  };
}
