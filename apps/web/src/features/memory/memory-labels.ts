import type { MemoryKind, MemoryStatus } from '@wbfm/shared/types';

/** 长期记忆展示文案与徽标配色集中管理 */

export const MEMORY_KIND_OPTIONS: Array<{ value: MemoryKind; label: string }> = [
  { value: 'fact', label: '事实' },
  { value: 'preference', label: '偏好' },
  { value: 'event', label: '事件' },
];

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  fact: '事实',
  preference: '偏好',
  event: '事件',
};

export const MEMORY_STATUS_LABELS: Record<MemoryStatus, string> = {
  active: '活跃',
  archived: '已归档',
};

export const MEMORY_KIND_BADGE: Record<MemoryKind, 'default' | 'success' | 'warning'> = {
  fact: 'default',
  preference: 'success',
  event: 'warning',
};

export function formatMemoryDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
