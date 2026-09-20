'use client';

import type { Assistant, KnowledgeBase, ProviderModel } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
              {assistant.isBuiltin && <Badge variant="outline">内置</Badge>}
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {assistant.systemPrompt || '未设置系统提示词'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(assistant)}>
            编辑
          </Button>
          {!assistant.isBuiltin && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-red-500 hover:text-red-600"
              onClick={() => onDelete(assistant)}
            >
              删除
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="default">{boundModel ? boundModel.displayName : '默认模型'}</Badge>
        {boundKb && <Badge variant="success">知识库：{boundKb.name}</Badge>}
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
          aria-label={`${assistant.name} 上移`}
          onClick={() => onMove(assistant, -1)}
        >
          ↑ 上移
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
          disabled={!canMoveDown}
          aria-label={`${assistant.name} 下移`}
          onClick={() => onMove(assistant, 1)}
        >
          ↓ 下移
        </button>
      </div>
    </article>
  );
}
