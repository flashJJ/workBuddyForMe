'use client';

import { Archive, Share2 } from 'lucide-react';
import type { Assistant, Conversation } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSkills } from '@/lib/hooks/use-skills';
import { AssistantSwitcher } from './assistant-switcher';
import { PlanChip } from '../plans/plan-chip';

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

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground"
      data-testid="chat-capability-summary"
    >
      <span className="rounded bg-muted px-1.5 py-0.5">
        {assistant.modelId
          ? t('assistants.capability.modelBound')
          : t('assistants.capability.modelDefault')}
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5">
        {t('assistants.capability.kb', { count: kbCount })}
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5">
        {globalSkills
          ? t('assistants.capability.skillsGlobal', { count: skillCount })
          : t('assistants.capability.skills', { count: skillCount })}
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5">
        {mcpCount > 0
          ? t('assistants.capability.toolsMcp', { count: toolCount, mcp: mcpCount })
          : t('assistants.capability.tools', { count: toolCount })}
      </span>
    </div>
  );
}

/** 对话页顶栏：助手切换 + 能力摘要 + 压缩轮次徽章 + 分享入口 */
export function ChatHeader({
  assistants,
  assistantId,
  currentAssistant,
  currentConversation,
  onAssistantChange,
  onShowSummary,
  onShare,
}: Props) {
  const { t } = useI18n();
  return (
    <header className="flex items-center justify-between border-b px-4 py-2.5">
      <div className="flex min-w-0 flex-col gap-1">
        <AssistantSwitcher assistants={assistants} value={assistantId} onChange={onAssistantChange} />
        {currentAssistant && <CapabilitySummary assistant={currentAssistant} />}
      </div>
      <div className="flex items-center gap-3">
        <PlanChip conversationId={currentConversation?.id ?? null} />
        {currentConversation?.summaryTurns ? (
          <button
            type="button"
            data-testid="compaction-badge"
            onClick={onShowSummary}
            title={t('chat.viewSummaryTitle')}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            <Archive className="h-3 w-3" />
            {t('chat.compactedBadge', { count: currentConversation.summaryTurns })}
          </button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="share-conversation-button"
          disabled={!currentConversation}
          onClick={onShare}
        >
          <Share2 className="mr-1 h-3.5 w-3.5" />
          {t('common.actions.share')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('chat.localPrivateStreaming')}</span>
      </div>
    </header>
  );
}
