/** v4.25 触发器对话框纯函数：便于单测，不依赖 React */

/** 把逗号/空格分隔的扩展名归一为小写无点去重数组 */
export function parseExtensions(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,，\s]+/)
        .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean),
    ),
  ];
}

/** 绝对化 Webhook 展示地址 */
export function buildWebhookUrl(path: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}${path}`;
}

/** 最近触发时间展示 */
export function formatTriggerTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
