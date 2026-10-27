import type { Language } from '@wbfm/shared/constants';
import type { MemoryKind, MemoryRecallReason, MemoryStatus } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { formatDateTime } from '@/lib/i18n/intl';

/** 长期记忆展示文案键与徽标配色集中管理（文案在渲染处 t() 解析） */

export const MEMORY_KIND_OPTIONS: Array<{ value: MemoryKind; labelKey: MessageKey }> = [
  { value: 'fact', labelKey: 'memory.kind.fact' },
  { value: 'preference', labelKey: 'memory.kind.preference' },
  { value: 'event', labelKey: 'memory.kind.event' },
  { value: 'relationship', labelKey: 'memory.kind.relationship' },
];

export const MEMORY_KIND_LABELS: Record<MemoryKind, MessageKey> = {
  fact: 'memory.kind.fact',
  preference: 'memory.kind.preference',
  event: 'memory.kind.event',
  relationship: 'memory.kind.relationship',
};

export const MEMORY_STATUS_LABELS: Record<MemoryStatus, MessageKey> = {
  active: 'memory.status.active',
  archived: 'memory.status.archived',
};

export const MEMORY_KIND_BADGE: Record<MemoryKind, 'default' | 'success' | 'warning'> = {
  fact: 'default',
  preference: 'success',
  event: 'warning',
  relationship: 'success',
};

export const MEMORY_RECALL_REASON_LABELS: Record<MemoryRecallReason, MessageKey> = {
  semantic: 'memory.recallReason.semantic',
};

export function formatMemoryDate(iso: string | null, locale: Language): string {
  if (!iso) return '—';
  return formatDateTime(iso, locale);
}

/** v2.6：召回相关度分档（只展示高/中/低，不展示伪精确百分比） */
export function recallLevelKey(score: number): MessageKey {
  if (score >= 0.7) return 'memory.recallLevel.high';
  if (score >= 0.55) return 'memory.recallLevel.medium';
  return 'memory.recallLevel.low';
}

/** v2.6：来源会话/消息跳转地址（无来源返回 null） */
export function memorySourceHref(memory: {
  sourceConversationId: string | null;
  sourceMessageId: string | null;
}): string | null {
  if (!memory.sourceConversationId) return null;
  const params = new URLSearchParams({ conversation: memory.sourceConversationId });
  if (memory.sourceMessageId) params.set('message', memory.sourceMessageId);
  return `/chat?${params.toString()}`;
}
