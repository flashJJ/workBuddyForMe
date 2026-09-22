'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { filterCommands, type Command, type CommandGroup } from '@wbfm/shared';
import { cn } from '@/lib/utils';
import { useCommands, COMMAND_ICONS } from './use-commands';

const GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: '导航',
  conversation: '会话',
  assistant: '助手',
  settings: '设置',
  update: '更新',
};

const GROUP_ORDER: CommandGroup[] = ['navigation', 'conversation', 'assistant', 'settings', 'update'];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navigate: (href: string) => void;
}

/**
 * 命令面板（M5）：Ctrl+K 唤起，模糊搜索内置命令，↑↓ 导航，Enter 执行，Esc 关闭。
 * 基于 Radix Dialog 实现，无外部聚焦陷阱依赖（手动管理 input 与 list 焦点）。
 */
export function CommandPalette({ open, onOpenChange, navigate }: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const commands = useCommands({ navigate, close });

  const filtered = React.useMemo(() => filterCommands(commands, query), [commands, query]);

  // 打开时重置状态并聚焦输入框
  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // 下一帧聚焦，避免 Dialog 动画期间焦点抢占
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 过滤结果变化时重置选中项
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 按 group 分组，保留组内顺序
  const grouped = React.useMemo(() => {
    const map = new Map<CommandGroup, Command[]>();
    for (const cmd of filtered) {
      const arr = map.get(cmd.group) ?? [];
      arr.push(cmd);
      map.set(cmd.group, arr);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }));
  }, [filtered]);

  // 扁平化用于键盘索引
  const flat = React.useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = flat[activeIndex];
      if (cmd && !cmd.disabled) {
        void cmd.action({ navigate, close, conversationId: null });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  // 滚动到选中项
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60"
          onClick={() => onOpenChange(false)}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[20%] z-[51] w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border bg-background shadow-2xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b px-4 py-3">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入命令名称…（↑↓ 选择，Enter 执行，Esc 关闭）"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              data-testid="command-input"
            />
          </div>

          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {flat.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                没有匹配「{query}」的命令
              </div>
            ) : (
              grouped.map(({ group, items }) => (
                <div key={group} className="mb-1">
                  <div className="px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {GROUP_LABELS[group]}
                  </div>
                  {items.map((cmd) => {
                    const globalIndex = flat.indexOf(cmd);
                    const active = globalIndex === activeIndex;
                    const Icon = COMMAND_ICONS[cmd.id];
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        data-active={active}
                        data-testid={`command-item-${cmd.id}`}
                        disabled={cmd.disabled}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                        onClick={() => {
                          if (!cmd.disabled) void cmd.action({ navigate, close, conversationId: null });
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                          active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                          cmd.disabled && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                        <span className="flex-1 truncate">{cmd.label}</span>
                        {cmd.description ? (
                          <span className="truncate text-xs text-muted-foreground">{cmd.description}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
