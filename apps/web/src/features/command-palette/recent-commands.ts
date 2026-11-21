'use client';

const KEY = 'wbfm.commandPalette.recent';
const MAX = 5;

/** v4.17：记录最近执行命令，命令面板打开时置顶 */
export function readRecentCommands(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX);
  } catch {
    return [];
  }
}

export function recordRecentCommand(id: string): void {
  const next = [id, ...readRecentCommands().filter((item) => item !== id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 隐私模式/配额异常时静默降级：只影响置顶，不影响命令执行
  }
}
