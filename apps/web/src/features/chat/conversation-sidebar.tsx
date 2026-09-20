'use client';

import type { Conversation } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/state';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  disabled,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30" data-testid="conversation-sidebar">
      <div className="p-3">
        <Button type="button" className="w-full" size="sm" onClick={onNew} disabled={disabled}>
          + 新对话
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <EmptyState title="暂无对话" description="发送消息后自动保存到这里。" />
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <div
                  className={`group flex items-center rounded-md px-2 py-1.5 text-sm ${
                    conversation.id === activeId ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => onSelect(conversation.id)}
                    aria-current={conversation.id === activeId ? 'true' : undefined}
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  <span className="ml-1 hidden shrink-0 gap-1 group-hover:flex">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      aria-label={`重命名 ${conversation.title}`}
                      onClick={() => onRename(conversation)}
                    >
                      改
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-red-500"
                      aria-label={`删除 ${conversation.title}`}
                      onClick={() => onDelete(conversation)}
                    >
                      删
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
