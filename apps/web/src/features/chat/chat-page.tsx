'use client';

import * as React from 'react';
import { Archive, Brain, Share2 } from 'lucide-react';
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
import { ConversationSummaryDialog } from './conversation-summary-dialog';
import { ConversationSidebar } from './conversation-sidebar';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { ToolConfirmDialog } from './tool-confirm-dialog';
import { useChatSession } from './use-chat-session';
import { useVoicePlayback } from '../voice/use-voice-playback';
import { useVoiceSettings } from '../voice/use-voice-settings';
import { VoiceToggle } from '../voice/voice-toggle';
import { MicButton } from '../voice/mic-button';
import { HandsfreeMicButton } from '../voice/handsfree-mic-button';
import { useHandsfreeVoice } from '../voice/use-handsfree-voice';
import { ChatAvatarRail } from '../avatar/chat-avatar-rail';
import { ChatSetupGuide } from './chat-setup-guide';

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

  // v1.0：语音朗读（本地 TTS）。开关持久化在语音设置；播放队列与停止联动。
  const { settings: voiceSettings, modelStatus: voiceModelStatus, update: updateVoiceSettings } =
    useVoiceSettings();
  const playback = useVoicePlayback();
  const [ttsEnabled, setTtsEnabled] = React.useState(false);
  React.useEffect(() => {
    if (voiceSettings) setTtsEnabled(voiceSettings.ttsEnabled);
  }, [voiceSettings]);

  const handleTtsToggle = React.useCallback(
    (next: boolean) => {
      setTtsEnabled(next);
      void updateVoiceSettings({ ttsEnabled: next });
    },
    [updateVoiceSettings],
  );

  // 传给会话的语音接线必须稳定（避免 reset/stop 回调反复重建）
  const voiceBridge = React.useMemo(
    () => ({
      ttsEnabled,
      onAudio: playback.enqueue,
      cancelPlayback: playback.cancel,
    }),
    [ttsEnabled, playback.enqueue, playback.cancel],
  );

  const session = useChatSession(assistantId, conversationId, (createdId) => {
    setConversationId(createdId);
  }, voiceBridge);

  // M4：免手持续聆听（VAD）。PTT 路径保持独立，仅输入方式切到 vad 时挂载监控。
  const handsfree = useHandsfreeVoice({
    asrReady: !!voiceModelStatus?.asrReady,
    canArm: !!voiceSettings?.asrEnabled && voiceSettings.inputMode === 'vad',
    sensitivity: voiceSettings?.vadSensitivity ?? 'balanced',
    silenceMs: voiceSettings?.vadSilenceMs ?? 900,
    playback, onRecognizedSend: (text) => session.send(text), onAbortTurn: session.stop,
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

  /** HITL 工具确认：提交失败（超时已被服务端自动拒绝等）提示并保持弹窗 */
  const submitToolConfirm = async (action: 'allow' | 'deny', remember?: 'assistant' | 'all' | 'task') => {
    if (confirmSubmitting) return false;
    setConfirmSubmitting(true);
    try {
      const ok = await session.confirmTool(action, remember);
      if (!ok) {
        toast.error('确认提交失败：该请求可能已超时，请重试或停止本轮对话');
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
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <AssistantSwitcher
            assistants={assistants ?? []}
            value={assistantId}
            onChange={switchAssistant}
          />
          <div className="flex items-center gap-3">
            {currentConversation?.summaryTurns ? (
              <button
                type="button"
                data-testid="compaction-badge"
                onClick={() => setSummaryOpen(true)}
                title="查看模型自动生成的早期对话摘要"
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                <Archive className="h-3 w-3" />
                已压缩 {currentConversation.summaryTurns} 条早期消息
              </button>
            ) : null}
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
            {session.recalledMemories.length > 0 && (
              <div
                data-testid="recalled-memories-hint"
                title={session.recalledMemories.map((m) => m.content).join('\n')}
                className="mx-auto mt-2 flex w-full max-w-3xl items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
              >
                <Brain className="h-3 w-3" />
                本轮参考了 {session.recalledMemories.length} 条长期记忆
              </div>
            )}
            <MessageList
              messages={session.messages}
              assistantName={currentAssistant?.name ?? '助手'}
              streaming={session.streaming}
              onRetry={session.retry}
              onResend={session.send}
              onFeedback={session.applyFeedback}
            />
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
      {voiceSettings?.avatarEnabled && hasChatModel && (
        <ChatAvatarRail
          modelId={voiceSettings.avatarModelId || 'haru'}
          messages={session.messages}
          getLevel={playback.getLevel}
          speaking={playback.speaking}
        />
      )}
    </div>
  );
}
