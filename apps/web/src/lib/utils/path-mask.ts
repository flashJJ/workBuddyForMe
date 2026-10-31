/**
 * v2.14：工作目录展示脱敏——保留盘符 / 首段与末级目录，中间折叠。
 * 例：D:\work\demo → D:\…\demo；/home/alice/proj → /home/…/proj
 */
export function maskWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  const windows = /^[A-Za-z]:$/.test(parts[0] ?? '');
  const separator = windows ? '\\' : '/';
  const root = windows ? parts[0]! : `/${parts[0]}`;
  return `${root}${separator}…${separator}${parts[parts.length - 1]}`;
}
