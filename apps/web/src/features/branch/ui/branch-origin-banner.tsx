'use client';

import { ArrowLeft, GitFork } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useConversations } from '@/lib/hooks/chat';
import { useBranchByChild } from '../hooks/use-branches';

/** v2.21：子会话顶部来源条：父会话标题 + 分支目标 + 返回入口 */
export function BranchOriginBanner({ conversationId }: { conversationId: string | null }) {
  const { t } = useI18n();
  const { branch } = useBranchByChild(conversationId);
  const { data: conversations } = useConversations();
  if (!branch) return null;

  const parentTitle =
    conversations?.find((conversation) => conversation.id === branch.parentConversationId)?.title ??
    branch.parentConversationId;
  const parentHref = `/chat?conversation=${encodeURIComponent(branch.parentConversationId)}`;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground"
      data-testid="branch-origin-banner"
    >
      <GitFork className="h-3.5 w-3.5" />
      <span>
        {t('branch.origin.parent')} <span className="text-foreground">{parentTitle}</span>
      </span>
      <span className="line-clamp-1">
        {t('branch.origin.goal')}：{branch.goal}
      </span>
      <Link
        href={parentHref}
        className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted hover:text-foreground"
        data-testid="branch-origin-back"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('branch.origin.back')}
      </Link>
    </div>
  );
}
