'use client';

import * as React from 'react';
import type { KnowledgeBase } from '@wbfm/shared/types';
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  STARTER_KNOWLEDGE_BASES,
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
import { NumberInput } from '@/components/ui/number-input';
import { SimpleSelect } from '@/components/ui/simple-select';
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

  /** v2.3 从模板创建：预填名称 / 说明 / 推荐分片参数；选「空白知识库」则重置为默认 */
  const applyTemplate = (templateId: string) => {
    const template = STARTER_KNOWLEDGE_BASES.find((item) => item.id === templateId);
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setChunkSize(String(template?.chunkSize ?? DEFAULT_CHUNK_SIZE));
    setChunkOverlap(String(template?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP));
  };

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
          {!isEdit && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
              <Label htmlFor="kb-template">{t('knowledge.form.templateLabel')}</Label>
              <SimpleSelect id="kb-template" value="" onValueChange={applyTemplate}>
                <option value="">{t('knowledge.form.templateBlank')}</option>
                {STARTER_KNOWLEDGE_BASES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </SimpleSelect>
              <p className="text-xs text-muted-foreground">{t('knowledge.form.templateHint')}</p>
            </div>
          )}
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
              <NumberInput
                id="kb-chunk-size"
                min={MIN_CHUNK_SIZE}
                max={MAX_CHUNK_SIZE}
                value={Number(chunkSize)}
                onValueChange={(v) => setChunkSize(String(v))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-chunk-overlap">{t('knowledge.form.chunkOverlap')}</Label>
              <NumberInput
                id="kb-chunk-overlap"
                min={0}
                value={Number(chunkOverlap)}
                onValueChange={(v) => setChunkOverlap(String(v))}
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
