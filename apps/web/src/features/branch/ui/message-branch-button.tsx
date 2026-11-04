'use client';

import { GitFork } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v2.21：消息底部「从此分支」触发按钮；对话框由消息项统一管理（右键同入口） */
export function MessageBranchButton({
  onOpen,
  disabled,
}: {
  onOpen: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      onClick={onOpen}
      disabled={disabled}
      data-testid="message-branch-button"
    >
      <GitFork className="h-3 w-3" />
      {t('branch.create.title')}
    </button>
  );
}
