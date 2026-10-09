'use client';

import type { Conversation } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  conversation: Conversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** v0.5：查看当前会话被递归摘要压缩的早期对话内容 */
export function ConversationSummaryDialog({ conversation, open, onOpenChange }: Props) {
  const { t } = useI18n();
  return (
    <Dialog open={open && Boolean(conversation?.summary)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('chat.summary.title')}</DialogTitle>
          <DialogDescription>{t('chat.summary.description')}</DialogDescription>
        </DialogHeader>
        <div
          data-testid="conversation-summary-text"
          className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-6"
        >
          {conversation?.summary ?? ''}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
