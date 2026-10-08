'use client';

import { Archive, Share2 } from 'lucide-react';
import type { Assistant, Conversation } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { AssistantSwitcher } from './assistant-switcher';

interface Props {
  assistants: Assistant[];
  assistantId: string;
  currentConversation: Conversation | null;
  onAssistantChange: (id: string) => void;
  onShowSummary: () => void;
  onShare: () => void;
}

/** 对话页顶栏：助手切换 + 压缩轮次徽章 + 分享入口 */
export function ChatHeader({
  assistants,
  assistantId,
  currentConversation,
  onAssistantChange,
  onShowSummary,
  onShare,
}: Props) {
  return (
    <header className="flex items-center justify-between border-b px-4 py-2.5">
      <AssistantSwitcher assistants={assistants} value={assistantId} onChange={onAssistantChange} />
      <div className="flex items-center gap-3">
        {currentConversation?.summaryTurns ? (
          <button
            type="button"
            data-testid="compaction-badge"
            onClick={onShowSummary}
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
          disabled={!currentConversation}
          onClick={onShare}
        >
          <Share2 className="mr-1 h-3.5 w-3.5" />
          分享
        </Button>
        <span className="text-xs text-muted-foreground">本地私有 · 流式输出</span>
      </div>
    </header>
  );
}
