/**
 * 副本策略与卡文改名工具（04 §5：冲突只允许导入为副本，原名加「（导入副本）」后缀）。
 */

export const COPY_SUFFIX = '（导入副本）';

/**
 * 在已占用名称集合中为冲突名找一个唯一名：
 * 先试「原名（导入副本）」，再试带序号 2、3…；超 maxLen 截断原名主体。
 */
export function uniqueCopyName(base: string, used: Set<string>, maxLen: number): string {
  const fit = (candidate: string): string =>
    candidate.length > maxLen ? candidate.slice(0, maxLen) : candidate;
  let candidate = fit(`${base}${COPY_SUFFIX}`);
  let n = 2;
  while (used.has(candidate)) {
    candidate = fit(`${base}${COPY_SUFFIX}${n}`);
    n += 1;
  }
  return candidate;
}

/**
 * 回写角色卡 frontmatter 的 name 标量（解析已保证 frontmatter 存在且 name 合法）。
 * 仅替换第一段 frontmatter 内的 name 行，正文一字不动。
 */
export function rewriteCardName(rawMarkdown: string, newName: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(rawMarkdown);
  if (!match || match[1] === undefined) {
    throw new Error('角色卡缺少 frontmatter，无法改名');
  }
  const frontmatter = match[1].replace(/^name:\s*.*$/m, `name: ${newName}`);
  return `---\n${frontmatter}\n---${rawMarkdown.slice(match[0].length)}`;
}
