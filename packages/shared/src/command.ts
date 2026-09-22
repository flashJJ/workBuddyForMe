/**
 * 命令面板契约（M5）。
 *
 * 命令以纯数据描述，渲染层负责展示与键盘交互；执行由 Command.action 回调完成。
 * CommandContext 为命令提供运行时数据（当前会话 ID、导航函数等）。
 */

/** 命令分组，用于面板内分组展示与快捷键提示 */
export type CommandGroup = 'navigation' | 'conversation' | 'assistant' | 'settings' | 'update';

export interface CommandContext {
  /** 当前选中的会话 ID（无则 null） */
  conversationId?: string | null;
  /** 导航到指定路径（Next.js router.push 的薄封装） */
  navigate: (href: string) => void;
  /** 关闭命令面板 */
  close: () => void;
}

export interface Command {
  /** 唯一 ID */
  id: string;
  /** 展示标题 */
  label: string;
  /** 副标题/描述 */
  description?: string;
  /** 分组 */
  group: CommandGroup;
  /** 模糊搜索关键词（除 label 外的可匹配词） */
  keywords?: string[];
  /** 是否禁用（禁用项仍展示但不可执行） */
  disabled?: boolean;
  /** 执行动作；返回 Promise 时面板会等待完成 */
  action: (ctx: CommandContext) => void | Promise<void>;
}

/**
 * 命令注册表：渲染层通过此接口获取命令列表。
 * 实现方可以是静态数组或带数据依赖的工厂函数。
 */
export interface CommandRegistry {
  /** 返回当前可用命令列表（按 group 排序由调用方决定） */
  list(): Command[];
}

/** 简易模糊匹配：query 的每个字符按顺序出现在 target 中（大小写不敏感） */
export function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi];
    if (!ch) continue;
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

/** 对命令做模糊过滤：命中 label/description/keywords 任一即保留 */
export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;
  return commands.filter((cmd) => {
    if (fuzzyMatch(cmd.label, query)) return true;
    if (cmd.description && fuzzyMatch(cmd.description, query)) return true;
    return (cmd.keywords ?? []).some((k) => fuzzyMatch(k, query));
  });
}
