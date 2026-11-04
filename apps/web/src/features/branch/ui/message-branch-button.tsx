'use client';

import * as React from 'react';
import { GitFork } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { MessageBranchDialog } from './message-branch-dialog';

/** v2.21：消息底部「从此分支」按钮；以消息正文预填分支目标 */
export function MessageBranchButton({
  conversationId,
  content,
  disabled,
}: {
  conversationId: string;
  content: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={disabled}
        data-testid="message-branch-button"
      >
        <GitFork className="h-3 w-3" />
        {t('branch.create.title')}
      </button>
      {open && (
        <MessageBranchDialog
          conversationId={conversationId}
          open={open}
          onOpenChange={setOpen}
          defaultGoal={content}
        />
      )}
    </>
  );
}
