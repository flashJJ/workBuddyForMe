'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useBranchActions, type BranchCreatePayload } from '../hooks/use-branches';
import { BranchCreateForm } from './branch-create-form';

interface Props {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 消息正文作为默认目标 */
  defaultGoal?: string;
}

/** v2.21：消息底部「从此分支」入口的派生对话框 */
export function MessageBranchDialog({ conversationId, open, onOpenChange, defaultGoal }: Props) {
  const { t } = useI18n();
  const actions = useBranchActions(conversationId);
  const error = actions.create.error as { message?: string } | null;

  const submit = (payload: BranchCreatePayload): void => {
    actions.create.mutate(payload, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="message-branch-dialog">
        <DialogHeader>
          <DialogTitle>{t('branch.create.title')}</DialogTitle>
          <DialogDescription>{t('branch.empty')}</DialogDescription>
        </DialogHeader>
        <BranchCreateForm
          defaultGoal={defaultGoal}
          busy={actions.create.isPending}
          error={error?.message ?? null}
          onSubmit={submit}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('branch.create.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
