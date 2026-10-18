'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
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
          <FormField label={t('common.words.name')} htmlFor="flow-name" error={error}>
            <Input
              id="flow-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={t('flows.form.namePlaceholder')}
              className="h-9"
            />
          </FormField>
          <FormField label={t('flows.form.descLabel')} htmlFor="flow-desc">
            <Textarea
              id="flow-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('flows.form.descPlaceholder')}
            />
          </FormField>
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
