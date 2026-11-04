'use client';

import { ArrowLeft, GitFork } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useConversations } from '@/lib/hooks/chat';
import { useBranchByChild } from '../hooks/use-branches';

/** v2.21：子会话顶部来源条：父会话标题 + 分支目标 + 返回入口 */
export function BranchOriginBanner({ conversationId }: { conversationId: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const { branch } = useBranchByChild(conversationId);
  const { data: conversations } = useConversations();
  if (!branch) return null;

  const parentTitle =
    conversations?.find((conversation) => conversation.id === branch.parentConversationId)?.title ??
    branch.parentConversationId;

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
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => router.push(`/chat?conversation=${encodeURIComponent(branch.parentConversationId)}`)}
        data-testid="branch-origin-back"
      >
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        {t('branch.origin.back')}
      </Button>
    </div>
  );
}
