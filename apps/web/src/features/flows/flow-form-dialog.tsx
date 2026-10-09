'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WorkflowCreateInput } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';

export interface FlowFormDialogProps {
  open: boolean;
  /** 传入则为编辑模式 */
  initial?: Partial<WorkflowCreateInput>;
  title: string;
  onSubmit: (body: WorkflowCreateInput) => void;
  onClose: () => void;
}

export function FlowFormDialog({ open, initial, title, onSubmit, onClose }: FlowFormDialogProps) {
  const { t } = useI18n();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setError(null);
    }
  }, [open, initial]);

  const submit = () => {
    if (!name.trim()) {
      setError(t('flows.form.nameRequired'));
      return;
    }
    onSubmit({ name: name.trim(), description: description.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('flows.form.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('common.words.name')}
            </label>
            <Input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={t('flows.form.namePlaceholder')}
              className="h-9"
            />
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('flows.form.descLabel')}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('flows.form.descPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={submit}>{t('common.actions.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
