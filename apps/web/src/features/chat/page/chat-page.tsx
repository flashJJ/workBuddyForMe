'use client';

import * as React from 'react';
import type { Conversation } from '@wbfm/shared/types';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/assistant';
import { useConversations, useConversationMutations } from '@/lib/hooks/chat';
import { useAllModels, useSettings } from '@/lib/hooks/provider';
import { ConversationRenameDialog } from '../sidebar/conversation-rename-dialog';
import { ConversationShareDialog } from '../sidebar/conversation-share-dialog';
import { ConversationSummaryDialog } from '../sidebar/conversation-summary-dialog';
import { ConversationSidebar } from '../sidebar/conversation-sidebar';
import { ChatHeader } from './chat-header';
import { MessageList } from '../message/message-list';
import { Composer } from '../composer/composer';
import { ToolConfirmDialog } from '../overlay/tool-confirm-dialog';
import { useChatVoiceCompanion } from '../hooks/use-chat-voice-companion';
import { ChatVoiceControls } from '../composer/chat-voice-controls';
import { ProactiveBubbleBar } from '../overlay/proactive-bubble';
import { ChatAvatarRail } from '@/features/avatar/ui';
import { useChatEvents } from '../hooks/use-chat-events';
import { useFirstAsk } from '../hooks/use-first-ask';
import { ChatSetupGuide } from './chat-setup-guide';
import { RecalledMemoriesBar } from '../overlay/recalled-memories-bar';
import { useChatDeepLink } from '../hooks/use-chat-deep-link';
import { ChatStageBar, useChatModelView } from '../stage';

export function ChatPage({
  deepLinkConversationId = null,
  deepLinkMessageId = null,
}: {
  deepLinkConversationId?: string | null;
  deepLinkMessageId?: string | null;
} = {}) {
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
  // v1.4：任务模式会话级开关（默认关，不跨会话/助手持久化；切换即复位）
  const [taskMode, setTaskMode] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [composerFocus, setComposerFocus] = React.useState(0);

  React.useEffect(() => {
    if (!assistantId && assistants && assistants.length > 0) {
      setAssistantId(assistants[0]!.id);
    }
  }, [assistants, assistantId]);

  const conversationsQuery = useConversations(assistantId || undefined);
  const currentAssistant = assistants?.find((item) => item.id === assistantId) ?? null;
  const currentConversation =
    conversationsQuery.data?.find((item) => item.id === conversationId) ?? null;

  const { hasChatModel, visionEnabled } = useChatModelView({
    assistant: currentAssistant,
    conversation: currentConversation,
    defaultChatModelId: settings?.defaultChatModelId,
    models,
  });

  // 语音伴侣聚合：TTS 播放/PTT/VAD/桌宠中继/F8 主动说话（主窗唯一音频出口）
  const companion = useChatVoiceCompanion({
    assistantId,
    conversationId,
    onConversationCreated: setConversationId,
    hasChatModel,
  });
  const { session, voiceSettings, ttsEnabled, handleTtsToggle, handsfree, petOpen } = companion;

  // v1.7 剧情事件编排（情绪基线/舞台/触发器；桌宠打开时主窗仍承接 TTS 与中继）
  const { expression: avatarExpression, stage: eventStage } = useChatEvents({
    assistantId,
    messages: session.messages,
    proactiveContent: companion.proactiveBubble?.content ?? null,
    settings,
    voiceSettings,
    hasChatModel,
    ttsEnabled,
    ttsReady: Boolean(companion.voiceModelStatus?.ttsReady),
    convLocked: session.streaming || handsfree.voiceState !== 'idle',
    ttsSpeaking: companion.playback.speaking,
    playback: {
      enqueue: companion.playback.enqueue,
      cancel: companion.playback.cancel,
      waitDrained: companion.playback.waitDrained,
    },
  });

  // v2.4 M1 T6：向导 firstAsk 步选中的示例问题，模型就绪后自动发出一次
  useFirstAsk(session.send, hasChatModel);

  const switchAssistant = (id: string) => { session.reset(); setTaskMode(false); setDraft(''); setAssistantId(id); setConversationId(null); };
  const newChat = () => { session.reset(); setTaskMode(false); setDraft(''); setConversationId(null); };
  const selectConversation = (id: string) => { session.reset(); setTaskMode(false); setDraft(''); setConversationId(id); };

  // v2.6 M4：记忆来源深链（/chat?conversation=&message=）
  useChatDeepLink({
    conversationId: deepLinkConversationId,
    onConversation: (conversation) => {
      setAssistantId(conversation.assistantId);
      selectConversation(conversation.id);
    },
  });
  const warnMissingMessage = React.useCallback(
    () => toast.error(t('memory.sourceMessageMissing')),
    [toast, t],
  );

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
      <ConversationSummaryDialog conversation={currentConversation} open={summaryOpen} onOpenChange={setSummaryOpen} />
      <ToolConfirmDialog
        open={Boolean(session.pendingConfirmation)}
        tool={session.pendingConfirmation?.tool ?? ''}
        permission={session.pendingConfirmation?.permission ?? 'write'}
        argsSummary={session.pendingConfirmation?.argsSummary ?? ''}
        submitting={confirmSubmitting}
        taskScopeAvailable={Boolean(conversationId || session.pendingConfirmation?.taskScope)}
        origin={session.pendingConfirmation?.taskScope ? 'agent' : undefined}
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
          currentAssistant={currentAssistant}
          currentConversation={currentConversation}
          onAssistantChange={switchAssistant}
          onShowSummary={() => setSummaryOpen(true)}
          onShare={() => setShareOpen(true)}
        />

        {hasChatModel ? (
          <>
            {conversationId && (
              <ChatStageBar
                conversationId={conversationId}
                streaming={session.streaming}
                draft={draft}
                conversationModelId={currentConversation?.modelId ?? null}
                assistantModelId={currentAssistant?.modelId ?? null}
                defaultModelId={settings?.defaultChatModelId ?? null}
                onTaskPrepared={(text) => { setDraft(text); setComposerFocus((value) => value + 1); }}
              />
            )}
            <RecalledMemoriesBar memories={session.recalledMemories} />
            <MessageList
              messages={session.messages}
              conversationId={conversationId}
              assistantName={currentAssistant?.name ?? t('chat.defaultAssistantName')}
              streaming={session.streaming}
              agentCards={session.agentCards}
              onRetry={session.retry}
              onResend={session.send}
              onFeedback={session.applyFeedback}
              streamTiming={session.streamTiming}
              highlightMessageId={deepLinkMessageId}
              onHighlightMissing={warnMissingMessage}
              onUsePrompt={(text) => { setDraft(text); setComposerFocus((value) => value + 1); }}
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
              visionEnabled={visionEnabled && !taskMode}
              taskMode={taskMode}
              onTaskModeChange={setTaskMode}
              leading={
                <ChatVoiceControls
                  ttsEnabled={ttsEnabled}
                  onTtsToggle={handleTtsToggle}
                  asrEnabled={Boolean(voiceSettings?.asrEnabled)}
                  inputMode={voiceSettings?.inputMode}
                  handsfree={handsfree}
                  streaming={session.streaming}
                  onRecognizedSend={session.send}
                />
              }
              draftValue={draft}
              onDraftChange={setDraft}
              focusToken={composerFocus}
              onSend={(content, attachmentIds) =>
                taskMode ? void session.sendTask(content) : session.send(content, attachmentIds)
              }
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
          expression={avatarExpression}
          eventStage={eventStage}
          getLevel={companion.playback.getLevel}
          speaking={companion.playback.speaking}
        />
      )}
    </div>
  );
}
