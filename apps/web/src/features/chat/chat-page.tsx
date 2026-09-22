'use client';

import * as React from 'react';
import Link from 'next/link';
import { Share2 } from 'lucide-react';
import type { Conversation } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useConversations, useConversationMutations } from '@/lib/hooks/use-conversations';
import { useAllModels, useSettings } from '@/lib/hooks/use-settings';
import { AssistantSwitcher } from './assistant-switcher';
import { ConversationRenameDialog } from './conversation-rename-dialog';
import { ConversationShareDialog } from './conversation-share-dialog';
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
  const [renaming, setRenaming] = React.useState<Conversation | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);

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

  // v0.3：当前生效模型（助手绑定优先，否则全局默认）是否具备视觉能力
  const visionEnabled = React.useMemo(() => {
    const effectiveModelId = currentAssistant?.modelId ?? settings?.defaultChatModelId ?? null;
    return Boolean(
      effectiveModelId &&
        (models ?? []).some(
          (model) => model.id === effectiveModelId && model.capabilities.includes('vision'),
        ),
    );
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

  // Electron 渲染进程不支持 window.prompt，统一使用应用内弹窗
  const submitRename = async (id: string, title: string) => {
    try {
      await conversationMutations.rename.mutateAsync({ id, title });
      return true;
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '重命名失败');
      return false;
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
        onRename={setRenaming}
        onDelete={(conversation) => void remove(conversation)}
      />
      <ConversationRenameDialog
        conversation={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        onSubmit={submitRename}
      />
      <ConversationShareDialog
        conversationId={conversationId}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <AssistantSwitcher
            assistants={assistants ?? []}
            value={assistantId}
            onChange={switchAssistant}
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="share-conversation-button"
              disabled={!conversationId}
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="mr-1 h-3.5 w-3.5" />
              分享
            </Button>
            <span className="text-xs text-muted-foreground">本地私有 · 流式输出</span>
          </div>
        </header>

        {hasChatModel ? (
          <>
            <MessageList
              messages={session.messages}
              assistantName={currentAssistant?.name ?? '助手'}
              streaming={session.streaming}
              onRetry={session.retry}
              onResend={session.send}
            />
            <Composer
              streaming={session.streaming}
              visionEnabled={visionEnabled}
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
