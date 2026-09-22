/** 分享序列化共用的展示格式化小工具（markdown/html 两端复用） */

/** 毫秒 → 人类可读耗时（2.3s） */
export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** ISO 时间 → 「2025-01-01 08:00」紧凑形式 */
export function formatTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16);
}
