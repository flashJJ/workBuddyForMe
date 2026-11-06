'use client';

import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import type { Conversation } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useCollapsiblePanel } from '@/lib/hooks/use-collapsible-panel';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
}

/** 会话列收起状态（localStorage 记忆，与形象栏共用 useCollapsiblePanel） */
const COLLAPSED_KEY = 'wbfm.chat.conversationSidebar.collapsed';

export function ConversationSidebar({
  conversations,
  activeId,
  disabled,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: Props) {
  const { t } = useI18n();
  // v2.23：窄窗口可把 240px 会话列收成 48px 图标条，宽度让给正文
  const { collapsed, toggle } = useCollapsiblePanel(COLLAPSED_KEY);

  if (collapsed) {
    return (
      <aside
        className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-muted/30 py-3"
        data-testid="conversation-sidebar"
        data-collapsed="true"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('chat.sidebar.expand')}
          title={t('chat.sidebar.expand')}
          data-testid="conversation-sidebar-toggle"
          onClick={toggle}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('chat.newConversationTitle')}
          title={t('chat.newConversationTitle')}
          data-testid="conversation-new"
          onClick={onNew}
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-r bg-muted/30"
      data-testid="conversation-sidebar"
      data-collapsed="false"
    >
      <div className="flex items-center gap-1 p-3">
        <Button type="button" className="flex-1" size="sm" onClick={onNew} disabled={disabled}>
          + {t('chat.newConversationTitle')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={t('chat.sidebar.collapse')}
          title={t('chat.sidebar.collapse')}
          data-testid="conversation-sidebar-toggle"
          onClick={toggle}
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <EmptyState title={t('chat.sidebar.emptyTitle')} description={t('chat.sidebar.emptyDescription')} />
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
                      aria-label={t('chat.sidebar.renameAria', { title: conversation.title })}
                      onClick={() => onRename(conversation)}
                    >
                      {t('chat.sidebar.renameShort')}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      aria-label={t('chat.sidebar.deleteAria', { title: conversation.title })}
                      onClick={() => onDelete(conversation)}
                    >
                      {t('chat.sidebar.deleteShort')}
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
