'use client';

import * as React from 'react';
import type {
  CharacterCardDiagnostic,
  CharacterCardRecord,
} from '@wbfm/shared/character-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import { ApiClientError } from '@/lib/api/client';
import { useCharacterCardMutations } from '@/lib/hooks/use-character-cards';

export interface CardEditorState {
  /** null = 新建（含导入）；有值 = 编辑该自建卡 */
  card: CharacterCardRecord | null;
  /** 新建/导入时的初始原文 */
  initialMarkdown?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: CardEditorState | null;
  onSaved?: (card: CharacterCardRecord) => void;
}

/** 角色卡 Markdown 编辑器：保存失败时把 422 行号诊断逐条展示在文本框下方 */
export function CharacterCardEditorDialog({ open, onOpenChange, editor, onSaved }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const mutations = useCharacterCardMutations();
  const [markdown, setMarkdown] = React.useState('');
  const [errors, setErrors] = React.useState<CharacterCardDiagnostic[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMarkdown(editor?.card?.rawMarkdown ?? editor?.initialMarkdown ?? '');
      setErrors([]);
    }
  }, [open, editor]);

  const isEdit = Boolean(editor?.card);

  const handleSave = async () => {
    setSubmitting(true);
    setErrors([]);
    try {
      const saved = editor?.card
        ? await mutations.update.mutateAsync({ id: editor.card.id, rawMarkdown: markdown })
        : await mutations.create.mutateAsync(markdown);
      toast.success(isEdit ? t('characterCards.toast.updated') : t('characterCards.toast.created'));
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError && Array.isArray(error.details)) {
        setErrors(error.details as CharacterCardDiagnostic[]);
      } else {
        toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('characterCards.editor.editTitle') : t('characterCards.editor.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('characterCards.editor.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="character-card-md">{t('characterCards.editor.mdLabel')}</Label>
          <Textarea
            id="character-card-md"
            data-testid="character-card-md"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={16}
            maxLength={20000}
            spellCheck={false}
            className="font-mono text-xs"
            aria-invalid={errors.length > 0}
            aria-describedby={errors.length ? 'character-card-errors' : undefined}
          />
          <p className="text-[11px] text-muted-foreground">{t('characterCards.editor.formatHint')}</p>
          {errors.length > 0 && (
            <ul
              id="character-card-errors"
              data-testid="character-card-errors"
              className="space-y-1 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive"
            >
              <li className="font-medium">{t('characterCards.editor.parseErrorTitle')}</li>
              {errors.map((error, index) => (
                <li key={`${error.code}-${index}`}>
                  {error.line ? `${t('characterCards.editor.line', { line: error.line })}：` : ''}
                  {error.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" disabled={submitting || !markdown.trim()} onClick={handleSave}>
            {submitting ? t('characterCards.editor.saving') : t('characterCards.editor.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
