import type { Language } from '@wbfm/shared/constants';
import type { MemoryKind, MemoryStatus } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { formatDateTime } from '@/lib/i18n/intl';

/** 长期记忆展示文案键与徽标配色集中管理（文案在渲染处 t() 解析） */

export const MEMORY_KIND_OPTIONS: Array<{ value: MemoryKind; labelKey: MessageKey }> = [
  { value: 'fact', labelKey: 'memory.kind.fact' },
  { value: 'preference', labelKey: 'memory.kind.preference' },
  { value: 'event', labelKey: 'memory.kind.event' },
];

export const MEMORY_KIND_LABELS: Record<MemoryKind, MessageKey> = {
  fact: 'memory.kind.fact',
  preference: 'memory.kind.preference',
  event: 'memory.kind.event',
};

export const MEMORY_STATUS_LABELS: Record<MemoryStatus, MessageKey> = {
  active: 'memory.status.active',
  archived: 'memory.status.archived',
};

export const MEMORY_KIND_BADGE: Record<MemoryKind, 'default' | 'success' | 'warning'> = {
  fact: 'default',
  preference: 'success',
  event: 'warning',
};

export function formatMemoryDate(iso: string | null, locale: Language): string {
  if (!iso) return '—';
  return formatDateTime(iso, locale);
}
