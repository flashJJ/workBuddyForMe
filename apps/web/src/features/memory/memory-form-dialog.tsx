'use client';

import * as React from 'react';
import type { Memory, MemoryKind, MemoryStatus } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useMemoryMutations, type MemoryCreateBody } from '@/lib/hooks/use-memories';
import { useI18n } from '@/lib/i18n/use-i18n';
import { MEMORY_KIND_OPTIONS, MEMORY_STATUS_LABELS } from './memory-labels';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传 null 表示新建 */
  memory: Memory | null;
}

interface FormState {
  kind: MemoryKind;
  content: string;
  importance: string;
  status: MemoryStatus;
}

function toForm(memory: Memory | null): FormState {
  return memory
    ? {
        kind: memory.kind,
        content: memory.content,
        importance: String(memory.importance),
        status: memory.status,
      }
    : { kind: 'fact', content: '', importance: '0.5', status: 'active' };
}

/** 记忆新建/编辑弹窗：新建走 POST，编辑走 PATCH；内容变更后服务端自动重算向量 */
export function MemoryFormDialog({ open, onOpenChange, memory }: Props) {
  const { t } = useI18n();
  const [form, setForm] = React.useState<FormState>(() => toForm(memory));
  const [submitting, setSubmitting] = React.useState(false);
  const toast = useToast();
  const mutations = useMemoryMutations();

  React.useEffect(() => {
    if (open) setForm(toForm(memory));
  }, [open, memory]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const importance = Number(form.importance);
    if (!form.content.trim()) {
      toast.error(t('memory.form.contentRequired'));
      return;
    }
    setSubmitting(true);
    try {
      if (memory) {
        await mutations.update.mutateAsync({
          id: memory.id,
          body: {
            kind: form.kind,
            content: form.content.trim(),
            importance,
            status: form.status,
          },
        });
        toast.success(t('memory.form.updated'));
      } else {
        const body: MemoryCreateBody = {
          kind: form.kind,
          content: form.content.trim(),
          importance,
        };
        await mutations.create.mutateAsync(body);
        toast.success(t('memory.form.created'));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{memory ? t('memory.form.editTitle') : t('memory.form.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('memory.form.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('memory.form.kindLabel')}</Label>
              <Select
                aria-label={t('memory.form.kindAria')}
                value={form.kind}
                onChange={(e) => update({ kind: e.target.value as MemoryKind })}
              >
                {MEMORY_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('memory.form.importanceLabel', { value: Number(form.importance).toFixed(1) })}</Label>
              <input
                type="range"
                aria-label={t('memory.form.importanceAria')}
                min={0}
                max={1}
                step={0.1}
                value={form.importance}
                onChange={(e) => update({ importance: e.target.value })}
                className="mt-2 h-2 w-full cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('memory.form.contentLabel')}</Label>
            <Textarea
              aria-label={t('memory.form.contentAria')}
              value={form.content}
              maxLength={500}
              rows={4}
              onChange={(e) => update({ content: e.target.value })}
              placeholder={t('memory.form.contentPlaceholder')}
            />
            <div className="text-right text-xs text-muted-foreground">
              {form.content.length}/500
            </div>
          </div>

          {memory && (
            <div className="space-y-1.5">
              <Label>{t('memory.form.statusLabel')}</Label>
              <Select
                aria-label={t('memory.form.statusAria')}
                value={form.status}
                onChange={(e) => update({ status: e.target.value as MemoryStatus })}
              >
                <option value="active">{t(MEMORY_STATUS_LABELS.active)}</option>
                <option value="archived">{t(MEMORY_STATUS_LABELS.archived)}</option>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? t('memory.form.saving') : t('common.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
