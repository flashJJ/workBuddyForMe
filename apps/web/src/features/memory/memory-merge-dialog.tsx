'use client';

import * as React from 'react';
import type { Memory } from '@wbfm/shared/types';
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

/**
 * v4.21：合并记忆——把选中的来源归档到目标条目，不复制内容。
 * 只允许选择 active 且非当前条目的记忆。
 */
export function MemoryMergeDialog({
  open,
  onOpenChange,
  target,
  candidates,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Memory | null;
  candidates: Memory[];
  onConfirm: (ids: string[]) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) setSelected([]);
  }, [open, target?.id]);

  const options = candidates.filter(
    (memory) => memory.status === 'active' && memory.id !== target?.id,
  );

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const confirm = async () => {
    if (selected.length === 0) return;
    await onConfirm(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="memory-merge-dialog">
        <DialogHeader>
          <DialogTitle>{t('memory.mergeTitle')}</DialogTitle>
          <DialogDescription>{t('memory.mergeDescription')}</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('memory.mergeEmpty')}</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {options.map((memory) => (
              <li key={memory.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    className="mt-1"
                    data-testid={`memory-merge-option-${memory.id}`}
                    checked={selected.includes(memory.id)}
                    onChange={() => toggle(memory.id)}
                  />
                  <span className="min-w-0 break-words">{memory.content}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            type="button"
            data-testid="memory-merge-confirm"
            disabled={busy || selected.length === 0}
            onClick={() => void confirm()}
          >
            {t('memory.merge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
