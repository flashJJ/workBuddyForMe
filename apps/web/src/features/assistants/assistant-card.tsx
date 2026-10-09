'use client';

import type { Assistant, KnowledgeBase, ProviderModel } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  assistant: Assistant;
  models: ProviderModel[];
  knowledgeBases: KnowledgeBase[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: (assistant: Assistant) => void;
  onDelete: (assistant: Assistant) => void;
  onMove: (assistant: Assistant, direction: -1 | 1) => void;
}

export function AssistantCard({
  assistant,
  models,
  knowledgeBases,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onMove,
}: Props) {
  const { t } = useI18n();
  const boundModel = models.find((model) => model.id === assistant.modelId);
  const boundKb = knowledgeBases.find((kb) => kb.id === assistant.knowledgeBaseId);

  return (
    <article
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      data-testid={`assistant-card-${assistant.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
            style={{ backgroundColor: `${assistant.color ?? '#6366f1'}22` }}
            aria-hidden
          >
            {assistant.emoji ?? '🤖'}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium">{assistant.name}</h3>
              {assistant.isBuiltin && <Badge variant="outline">{t('assistants.card.builtin')}</Badge>}
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {assistant.systemPrompt || t('assistants.card.noPrompt')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(assistant)}>
            {t('common.actions.edit')}
          </Button>
          {!assistant.isBuiltin && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(assistant)}
            >
              {t('common.actions.delete')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="default">
          {boundModel ? boundModel.displayName : t('assistants.card.defaultModel')}
        </Badge>
        {boundKb && (
          <Badge variant="success">{t('assistants.card.knowledgeBase', { name: boundKb.name })}</Badge>
        )}
        <span className="text-muted-foreground">
          T={assistant.temperature} · P={assistant.topP}
          {assistant.maxTokens ? ` · ≤${assistant.maxTokens}` : ''}
        </span>
      </div>

      <div className="flex justify-end gap-1 border-t pt-2">
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
          disabled={!canMoveUp}
          aria-label={t('assistants.card.moveUpAria', { name: assistant.name })}
          onClick={() => onMove(assistant, -1)}
        >
          {t('assistants.card.moveUp')}
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
          disabled={!canMoveDown}
          aria-label={t('assistants.card.moveDownAria', { name: assistant.name })}
          onClick={() => onMove(assistant, 1)}
        >
          {t('assistants.card.moveDown')}
        </button>
      </div>
    </article>
  );
}
