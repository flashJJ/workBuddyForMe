'use client';

import * as React from 'react';
import type { KnowledgeBase } from '@wbfm/shared/types';
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
} from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useKnowledgeMutations, type KnowledgeBaseBody } from '@/lib/hooks/use-knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBase?: KnowledgeBase | null;
}

export function KnowledgeBaseFormDialog({ open, onOpenChange, knowledgeBase }: Props) {
  const { t } = useI18n();
  const isEdit = Boolean(knowledgeBase);
  const mutations = useKnowledgeMutations();
  const toast = useToast();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [chunkSize, setChunkSize] = React.useState(String(DEFAULT_CHUNK_SIZE));
  const [chunkOverlap, setChunkOverlap] = React.useState(String(DEFAULT_CHUNK_OVERLAP));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(knowledgeBase?.name ?? '');
    setDescription(knowledgeBase?.description ?? '');
    setChunkSize(String(knowledgeBase?.chunkSize ?? DEFAULT_CHUNK_SIZE));
    setChunkOverlap(String(knowledgeBase?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP));
  }, [open, knowledgeBase]);

  const buildBody = (): KnowledgeBaseBody => ({
    name: name.trim(),
    description: description.trim(),
    chunkSize: Number(chunkSize),
    chunkOverlap: Number(chunkOverlap),
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit && knowledgeBase) {
        await mutations.update.mutateAsync({ id: knowledgeBase.id, body: buildBody() });
        toast.success(t('knowledge.form.updated'));
      } else {
        await mutations.create.mutateAsync(buildBody());
        toast.success(t('knowledge.form.created'));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('toast.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('knowledge.form.editTitle') : t('knowledge.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('knowledge.form.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kb-name">{t('common.words.name')}</Label>
            <Input
              id="kb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('knowledge.form.namePlaceholder')}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-desc">{t('common.words.description')}</Label>
            <Textarea
              id="kb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('knowledge.form.descPlaceholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kb-chunk-size">{t('knowledge.form.chunkSize')}</Label>
              <Input
                id="kb-chunk-size"
                type="number"
                min={MIN_CHUNK_SIZE}
                max={MAX_CHUNK_SIZE}
                value={chunkSize}
                onChange={(e) => setChunkSize(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-chunk-overlap">{t('knowledge.form.chunkOverlap')}</Label>
              <Input
                id="kb-chunk-overlap"
                type="number"
                min={0}
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('knowledge.form.paramsHint', { min: MIN_CHUNK_SIZE, max: MAX_CHUNK_SIZE })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('knowledge.form.saving') : t('common.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
