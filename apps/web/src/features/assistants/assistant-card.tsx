'use client';

import type { Assistant, KnowledgeBase, ProviderModel, SkillInfo } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  assistant: Assistant;
  models: ProviderModel[];
  knowledgeBases: KnowledgeBase[];
  /** v2.4 M4：技能目录（把 skillNames 显示为可读名称） */
  skills: SkillInfo[];
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
  skills,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onMove,
}: Props) {
  const { t } = useI18n();
  const boundModel = models.find((model) => model.id === assistant.modelId);
  const boundKbs = assistant.knowledgeBaseIds
    .map((id) => knowledgeBases.find((kb) => kb.id === id))
    .filter((kb): kb is KnowledgeBase => Boolean(kb));
  // v2.4 M4：能力可见性——技能（助手级勾选）与 MCP 工具
  const boundSkills = assistant.skillNames.map(
    (name) => skills.find((skill) => skill.name === name)?.name ?? name,
  );
  const mcpToolCount = assistant.enabledTools.filter((tool) => tool.startsWith('mcp:')).length;

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
        {boundKbs.map((kb) => (
          <Badge key={kb.id} variant="success">
            {t('assistants.card.knowledgeBase', { name: kb.name })}
          </Badge>
        ))}
        <span className="text-muted-foreground">
          T={assistant.temperature} · P={assistant.topP}
          {assistant.maxTokens ? ` · ≤${assistant.maxTokens}` : ''}
        </span>
      </div>

      {/* v2.4 M4（P1-2）：技能与 MCP 工具可见（此前只有模型/知识库） */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="assistant-capabilities">
        {boundSkills.length > 0 ? (
          boundSkills.map((name) => (
            <Badge key={name} variant="outline" data-testid="assistant-skill-badge">
              {t('assistants.card.skill', { name })}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">{t('assistants.card.skillsFollowGlobal')}</span>
        )}
        {mcpToolCount > 0 && (
          <Badge variant="info">{t('assistants.card.mcpTools', { count: mcpToolCount })}</Badge>
        )}
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
