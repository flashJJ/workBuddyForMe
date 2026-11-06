'use client';

import * as React from 'react';
import { Archive, MoreHorizontal, Share2 } from 'lucide-react';
import type { Assistant, Conversation } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSkills } from '@/lib/hooks/capability';
import { AssistantSwitcher } from '../sidebar/assistant-switcher';
import { PlanChip } from '@/features/plans/chip';
import { RunGraphLauncher } from '@/features/run-graph';
import { BranchLauncher, BranchOriginBanner } from '@/features/branch';

interface Props {
  assistants: Assistant[];
  assistantId: string;
  currentAssistant: Assistant | null;
  currentConversation: Conversation | null;
  onAssistantChange: (id: string) => void;
  onShowSummary: () => void;
  onShare: () => void;
}

/**
 * v2.4 M4（P1-2）：当前助手能力摘要——模型 / 知识库 / 技能 / 工具一屏可见，
 * 避免「对话中不知道这个助手到底挂了什么」。只读展示，不提供写操作。
 * v2.23：四个 chip 合并为一行小字并整体截断，顶栏不再占两行高度。
 */
function CapabilitySummary({ assistant }: { assistant: Assistant }) {
  const { t } = useI18n();
  const { data: skills } = useSkills();
  const enabledSkillCount = (skills ?? []).filter((skill) => skill.enabled).length;
  // 空 skillNames = 跟随全局；非空时只统计全局仍启用的（停用即回收）
  const skillCount =
    assistant.skillNames.length === 0
      ? enabledSkillCount
      : assistant.skillNames.filter((name) =>
          (skills ?? []).some((skill) => skill.name === name && skill.enabled),
        ).length;
  const kbCount = assistant.knowledgeBaseIds.length;
  const toolCount = assistant.enabledTools.length;
  const mcpCount = assistant.enabledTools.filter((tool) => tool.startsWith('mcp:')).length;
  const globalSkills = assistant.skillNames.length === 0;

  const summary = [
    assistant.modelId
      ? t('assistants.capability.modelBound')
      : t('assistants.capability.modelDefault'),
    t('assistants.capability.kb', { count: kbCount }),
    globalSkills
      ? t('assistants.capability.skillsGlobal', { count: skillCount })
      : t('assistants.capability.skills', { count: skillCount }),
    mcpCount > 0
      ? t('assistants.capability.toolsMcp', { count: toolCount, mcp: mcpCount })
      : t('assistants.capability.tools', { count: toolCount }),
  ].join(' · ');

  return (
    <div
      className="truncate text-[10px] leading-tight text-muted-foreground"
      title={summary}
      data-testid="chat-capability-summary"
    >
      {summary}
    </div>
  );
}

/**
 * 顶栏动作区：高频动作（计划摘要 / 压缩徽章 / 分享）留在外面，
 * 低频入口（过程图 / 分支 / 隐私说明）收进「更多」弹层，避免一行挤 7 个控件。
 */
function HeaderActions({
  conversation,
  onShowSummary,
  onShare,
}: {
  conversation: Conversation | null;
  onShowSummary: () => void;
  onShare: () => void;
}) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!moreOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      // 弹层里的入口会打开 fixed 抽屉（role=dialog），点抽屉内部不能算「点外面」，
      // 否则弹层被收起时会把刚打开的子抽屉一起卸载掉。
      if (target?.closest('[role="dialog"][aria-modal="true"]')) return;
      if (!moreRef.current?.contains(target)) setMoreOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  const conversationId = conversation?.id ?? null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <PlanChip conversationId={conversationId} />
      {conversation?.summaryTurns ? (
        <button
          type="button"
          data-testid="compaction-badge"
          onClick={onShowSummary}
          title={t('chat.viewSummaryTitle')}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          <Archive className="h-3 w-3" />
          {t('chat.compactedBadge', { count: conversation.summaryTurns })}
        </button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        data-testid="share-conversation-button"
        aria-label={t('common.actions.share')}
        title={t('common.actions.share')}
        disabled={!conversation}
        onClick={onShare}
      >
        <Share2 className="h-4 w-4" />
      </Button>
      {conversationId ? (
        <div className="relative" ref={moreRef}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label={t('common.actions.more')}
            title={t('common.actions.more')}
            onClick={() => setMoreOpen((value) => !value)}
            data-testid="chat-header-more"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {moreOpen ? (
            <div
              role="menu"
              aria-label={t('common.actions.more')}
              data-testid="chat-header-more-panel"
              className="absolute right-0 top-full z-40 mt-1 w-52 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <RunGraphLauncher kind="conversation" id={conversationId} menuItem />
              <BranchLauncher conversationId={conversationId} menuItem />
              <p className="mt-1 border-t px-2 pb-1 pt-2 text-[10px] leading-snug text-muted-foreground">
                {t('chat.localPrivateStreaming')}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 对话页顶栏：助手切换 + 能力摘要 + 摘要/分享/更多入口 */
export function ChatHeader({
  assistants,
  assistantId,
  currentAssistant,
  currentConversation,
  onAssistantChange,
  onShowSummary,
  onShare,
}: Props) {
  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <AssistantSwitcher
            assistants={assistants}
            value={assistantId}
            onChange={onAssistantChange}
          />
          {currentAssistant && <CapabilitySummary assistant={currentAssistant} />}
        </div>
        <HeaderActions
          conversation={currentConversation}
          onShowSummary={onShowSummary}
          onShare={onShare}
        />
      </header>
      <BranchOriginBanner conversationId={currentConversation?.id ?? null} />
    </>
  );
}
