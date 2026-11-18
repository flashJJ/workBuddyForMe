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
      const parsed = contextCondensedPayloadSchema.safeParse(item.payload);
      if (parsed.success) compactions.push({ id: item.id, value: parsed.data, at: item.at });
    }
  }

  return { intent, snapshot, compactions: compactions.slice(-COMPACTION_LIMIT).reverse() };
}
