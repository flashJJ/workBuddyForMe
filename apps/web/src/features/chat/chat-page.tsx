'use client';

import * as React from 'react';
import { Brain } from 'lucide-react';
import type { Conversation } from '@wbfm/shared/types';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useConversations, useConversationMutations } from '@/lib/hooks/use-conversations';
import { useAllModels, useSettings } from '@/lib/hooks/use-settings';
import { ConversationRenameDialog } from './conversation-rename-dialog';
import { ConversationShareDialog } from './conversation-share-dialog';
import { ConversationSummaryDialog } from './conversation-summary-dialog';
import { ConversationSidebar } from './conversation-sidebar';
import { ChatHeader } from './chat-header';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { ToolConfirmDialog } from './tool-confirm-dialog';
import { useChatVoiceCompanion } from './use-chat-voice-companion';
import { VoiceToggle } from '../voice/voice-toggle';
import { MicButton } from '../voice/mic-button';
import { HandsfreeMicButton } from '../voice/handsfree-mic-button';
import { ProactiveBubbleBar } from './proactive-bubble';
import { ChatAvatarRail } from '../avatar/chat-avatar-rail';
import { ChatSetupGuide } from './chat-setup-guide';

export function ChatPage() {
  const { data: assistants, isLoading: assistantsLoading } = useAssistants();
  const { data: settings } = useSettings();
  const { data: models } = useAllModels();
  const conversationMutations = useConversationMutations();
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();

  const [assistantId, setAssistantId] = React.useState<string>('');
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<Conversation | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [confirmSubmitting, setConfirmSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!assistantId && assistants && assistants.length > 0) {
      setAssistantId(assistants[0]!.id);
    }
  }, [assistants, assistantId]);

  const conversationsQuery = useConversations(assistantId || undefined);
  const currentAssistant = assistants?.find((item) => item.id === assistantId) ?? null;
  const currentConversation =
    conversationsQuery.data?.find((item) => item.id === conversationId) ?? null;

  // hasChatModel/visionEnabled 依赖下方模型列表；语音伴侣在模型能力算出后接线
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

  // 语音伴侣聚合：TTS 播放/PTT/VAD/桌宠中继/F8 主动说话（主窗唯一音频出口）
  const companion = useChatVoiceCompanion({
    assistantId,
    conversationId,
    onConversationCreated: setConversationId,
    hasChatModel,
  });
  const { session, voiceSettings, ttsEnabled, handleTtsToggle, handsfree, petOpen } = companion;

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
      toast.error(errorText(error, t, { fallback: 'toast.renameFailed' }));
      return false;
    }
  };

  const remove = async (conversation: { id: string; title: string }) => {
    if (
      !(await confirm({
        title: t('chat.deleteConversationTitle'),
        description: t('chat.deleteConversationConfirm', { title: conversation.title }),
        confirmText: t('common.actions.delete'),
        cancelText: t('common.actions.cancel'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await conversationMutations.remove.mutateAsync(conversation.id);
      if (conversationId === conversation.id) setConversationId(null);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.deleteFailed' }));
    }
  };

  /** HITL 工具确认：提交失败（超时已被服务端自动拒绝等）提示并保持弹窗 */
  const submitToolConfirm = async (action: 'allow' | 'deny', remember?: 'assistant' | 'all' | 'task') => {
    if (confirmSubmitting) return false;
    setConfirmSubmitting(true);
    try {
      const ok = await session.confirmTool(action, remember);
      if (!ok) {
        toast.error(t('toast.toolConfirmSubmitFailed'));
        return false;
      }
      return true;
    } finally {
      setConfirmSubmitting(false);
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
      <ConversationSummaryDialog
        conversation={currentConversation}
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
      />
      <ToolConfirmDialog
        open={Boolean(session.pendingConfirmation)}
        tool={session.pendingConfirmation?.tool ?? ''}
        permission={session.pendingConfirmation?.permission ?? 'write'}
        argsSummary={session.pendingConfirmation?.argsSummary ?? ''}
        submitting={confirmSubmitting}
        taskScopeAvailable={Boolean(conversationId)}
        onOpenChange={(open) => {
          // 不允许点遮罩/ESC 直接关闭而不做决策——必须显式拒绝
          if (!open && !confirmSubmitting) void submitToolConfirm('deny');
        }}
        onSubmit={submitToolConfirm}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          assistants={assistants ?? []}
          assistantId={assistantId}
          currentConversation={currentConversation}
          onAssistantChange={switchAssistant}
          onShowSummary={() => setSummaryOpen(true)}
          onShare={() => setShareOpen(true)}
        />

        {hasChatModel ? (
          <>
            {session.recalledMemories.length > 0 && (
              <div
                data-testid="recalled-memories-hint"
                title={session.recalledMemories.map((m) => m.content).join('\n')}
                className="mx-auto mt-2 flex w-full max-w-3xl items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
              >
                <Brain className="h-3 w-3" />
                {t('chat.recalledMemoriesHint', { count: session.recalledMemories.length })}
              </div>
            )}
            <MessageList
              messages={session.messages}
              assistantName={currentAssistant?.name ?? t('chat.defaultAssistantName')}
              streaming={session.streaming}
              onRetry={session.retry}
              onResend={session.send}
              onFeedback={session.applyFeedback}
            />
            {companion.proactiveBubble && (
              <ProactiveBubbleBar
                bubble={companion.proactiveBubble}
                assistantName={currentAssistant?.name ?? t('chat.defaultAssistantName')}
                onDismiss={companion.dismissProactive}
              />
            )}
            <Composer
              streaming={session.streaming}
              visionEnabled={visionEnabled}
              leading={
                <>
                  <VoiceToggle enabled={ttsEnabled} onEnabledChange={handleTtsToggle} />
                  {voiceSettings?.asrEnabled &&
                    (voiceSettings.inputMode === 'vad' ? (
                      <HandsfreeMicButton handsfree={handsfree} />
                    ) : (
                      <MicButton onRecognizedSend={(text) => session.send(text)} disabled={session.streaming} />
                    ))}
                </>
              }
              onSend={session.send}
              onStop={session.stop}
            />
          </>
        ) : (
          <ChatSetupGuide />
        )}
      </div>
      {voiceSettings?.avatarEnabled && hasChatModel && !petOpen && (
        <ChatAvatarRail
          modelId={voiceSettings.avatarModelId || 'haru'}
          messages={session.messages}
          getLevel={companion.playback.getLevel}
          speaking={companion.playback.speaking}
          proactiveContent={companion.proactiveBubble?.content ?? null}
        />
      )}
    </div>
  );
}
