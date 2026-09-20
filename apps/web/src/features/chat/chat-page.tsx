'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useConversations, useConversationMutations } from '@/lib/hooks/use-conversations';
import { useAllModels, useSettings } from '@/lib/hooks/use-settings';
import { AssistantSwitcher } from './assistant-switcher';
import { ConversationSidebar } from './conversation-sidebar';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { useChatSession } from './use-chat-session';

function SetupGuide() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">还没有可用的对话模型</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        请先在设置中新增供应商、添加对话模型，并将其设为默认模型（或给助手绑定模型）。
      </p>
      <Button asChild>
        <Link href="/settings">前往设置</Link>
      </Button>
    </div>
  );
}

export function ChatPage() {
  const { data: assistants, isLoading: assistantsLoading } = useAssistants();
  const { data: settings } = useSettings();
  const { data: models } = useAllModels();
  const conversationMutations = useConversationMutations();
  const toast = useToast();

  const [assistantId, setAssistantId] = React.useState<string>('');
  const [conversationId, setConversationId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!assistantId && assistants && assistants.length > 0) {
      setAssistantId(assistants[0]!.id);
    }
  }, [assistants, assistantId]);

  const conversationsQuery = useConversations(assistantId || undefined);
  const currentAssistant = assistants?.find((item) => item.id === assistantId) ?? null;

  const session = useChatSession(assistantId, conversationId, (createdId) => {
    setConversationId(createdId);
  });

  const hasChatModel = React.useMemo(() => {
    if (!currentAssistant) return false;
    if (currentAssistant.modelId) return true;
    if (settings?.defaultChatModelId) {
      return (models ?? []).some(
        (model) => model.id === settings.defaultChatModelId && model.capabilities.includes('chat'),
      );
    }
    return false;
  }, [currentAssistant, settings, models]);

  const switchAssistant = (id: string) => {
    session.reset();
    setAssistantId(id);
    setConversationId(null);
  };

  const newChat = () => {
    session.reset();
    setConversationId(null);
  };

  const selectConversation = (id: string) => {
    session.reset();
    setConversationId(id);
  };

  const rename = async (conversation: { id: string; title: string }) => {
    const title = window.prompt('新的对话标题', conversation.title);
    if (!title?.trim()) return;
    try {
      await conversationMutations.rename.mutateAsync({ id: conversation.id, title: title.trim() });
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '重命名失败');
    }
  };

  const remove = async (conversation: { id: string; title: string }) => {
    if (!window.confirm(`删除对话「${conversation.title}」？`)) return;
    try {
      await conversationMutations.remove.mutateAsync(conversation.id);
      if (conversationId === conversation.id) setConversationId(null);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '删除失败');
    }
  };

  if (assistantsLoading) return <Spinner />;

  return (
    <div className="flex h-full" data-testid="chat-page">
      <ConversationSidebar
        conversations={conversationsQuery.data ?? []}
        activeId={conversationId}
        disabled={!assistantId}
        onSelect={selectConversation}
        onNew={newChat}
        onRename={(conversation) => void rename(conversation)}
        onDelete={(conversation) => void remove(conversation)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <AssistantSwitcher
            assistants={assistants ?? []}
            value={assistantId}
            onChange={switchAssistant}
          />
          <span className="text-xs text-muted-foreground">本地私有 · 流式输出</span>
        </header>

        {hasChatModel ? (
          <>
            <MessageList
              messages={session.messages}
              assistantName={currentAssistant?.name ?? '助手'}
              streaming={session.streaming}
              onRetry={session.retry}
            />
            <Composer
              streaming={session.streaming}
              onSend={session.send}
              onStop={session.stop}
            />
          </>
        ) : (
          <SetupGuide />
        )}
      </div>
    </div>
  );
}
