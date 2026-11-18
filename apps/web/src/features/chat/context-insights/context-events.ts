import {
  contextCondensedPayloadSchema,
  contextSnapshotPayloadSchema,
  turnIntentSchema,
  type ContextCondensedPayload,
  type ContextSnapshotPayload,
  type TurnIntent,
} from '@wbfm/shared/schemas';

/** v4.8：上下文事件汇总（纯函数，供面板与测试共用） */

export interface ContextEventItem {
  id: string;
  type: string;
  at: string;
  payload: unknown;
}

export interface ContextInsightsData {
  intent: { value: TurnIntent; at: string } | null;
  snapshot: { value: ContextSnapshotPayload; at: string } | null;
  /** 最近 20 条压缩记录，按时间倒序 */
  compactions: Array<{ id: string; value: ContextCondensedPayload; at: string }>;
}

const COMPACTION_LIMIT = 20;

/** 旧事件可能超契约上限（如 fidelityMissing 38 条）；先宽松裁剪再校验，避免整条丢弃 */
function normalizeCondensed(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const source = payload as Record<string, unknown>;
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const text = (value: unknown, max: number): unknown =>
    typeof value === 'string' ? value.slice(0, max) : value;
  return {
    ...source,
    summary: text(source.summary, 8000),
    foldedMessageIds: list(source.foldedMessageIds).slice(0, 500),
    facts: list(source.facts)
      .slice(0, 20)
      .map((fact) => {
        const item = (fact ?? {}) as Record<string, unknown>;
        return { key: text(item.key, 80), value: text(item.value, 400) };
      }),
    decisions: list(source.decisions).slice(0, 10).map((item) => text(item, 300)),
    openLoops: list(source.openLoops).slice(0, 10).map((item) => text(item, 300)),
    fidelityMissing: list(source.fidelityMissing).slice(0, 20),
  };
}

export function summarizeContextEvents(
  items: readonly ContextEventItem[],
): ContextInsightsData {
  let intent: ContextInsightsData['intent'] = null;
  let snapshot: ContextInsightsData['snapshot'] = null;
  const compactions: ContextInsightsData['compactions'] = [];

  for (const item of items) {
    if (item.type === 'turn_intent') {
      const parsed = turnIntentSchema.safeParse(item.payload);
      if (parsed.success) intent = { value: parsed.data, at: item.at };
      continue;
    }
    if (item.type === 'context_snapshot') {
      const parsed = contextSnapshotPayloadSchema.safeParse(item.payload);
      if (parsed.success) snapshot = { value: parsed.data, at: item.at };
      continue;
    }
    if (item.type === 'context_condensed') {
      const parsed = contextCondensedPayloadSchema.safeParse(normalizeCondensed(item.payload));
      if (parsed.success) compactions.push({ id: item.id, value: parsed.data, at: item.at });
    }
  }

  return { intent, snapshot, compactions: compactions.slice(-COMPACTION_LIMIT).reverse() };
}
