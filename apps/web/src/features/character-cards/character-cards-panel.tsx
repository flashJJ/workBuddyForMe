'use client';

import * as React from 'react';
import type { CharacterCardRecord } from '@wbfm/shared/character-card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import {
  downloadCardMarkdown,
  readCardFile,
  useCharacterCardMutations,
  useCharacterCards,
} from '@/lib/hooks/use-character-cards';
import { CharacterCardEditorDialog, type CardEditorState } from './character-card-editor-dialog';

function CardRow({
  card,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
}: {
  card: CharacterCardRecord;
  onEdit: (card: CharacterCardRecord) => void;
  onDuplicate: (card: CharacterCardRecord) => void;
  onExport: (card: CharacterCardRecord) => void;
  onDelete: (card: CharacterCardRecord) => void;
}) {
  const { t } = useI18n();
  const isBuiltin = card.source === 'builtin';
  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md border p-3"
      data-testid={`character-card-row-${card.id}`}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{card.name}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              isBuiltin ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {isBuiltin ? t('characterCards.builtinBadge') : t('characterCards.customBadge')}
          </span>
        </div>
        {card.description && <p className="truncate text-xs text-muted-foreground">{card.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!isBuiltin && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(card)}>
            {t('characterCards.edit')}
          </Button>
        )}
        {isBuiltin && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onDuplicate(card)}>
            {t('characterCards.duplicate')}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => onExport(card)}>
          {t('characterCards.exportMd')}
        </Button>
        {!isBuiltin && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t('characterCards.delete')}：${card.name}`}
            onClick={() => onDelete(card)}
          >
            {t('characterCards.delete')}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * v1.8 设置-角色卡库：内置只读区 + 自建区；新建/导入打开 Markdown 编辑器，
 * 导出走原文下载，删除经二次确认（引用助手回落默认卡由服务端处理）。
 */
export function CharacterCardsPanel({ autoCreate = false }: { autoCreate?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: cards, isLoading, isError, refetch } = useCharacterCards();
  const mutations = useCharacterCardMutations();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [editor, setEditor] = React.useState<CardEditorState | null>(null);
  // 水合门控：查询态在 SSR 与客户端首帧不一致，直接据此切结构会水合失配（React #418/#422）。
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // v2.4 M5：命令面板「新建角色卡」深链接（/settings?new=card#setting-data）自动打开编辑器
  React.useEffect(() => {
    if (autoCreate) setEditor({ card: null });
  }, [autoCreate]);

  const builtins = (cards ?? []).filter((card) => card.source === 'builtin');
  const customs = (cards ?? []).filter((card) => card.source === 'custom');

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readCardFile(file);
      setEditor({ card: null, initialMarkdown: text });
    } catch {
      toast.error(t('characterCards.toast.importFailed'));
    }
  };

  const handleExport = async (card: CharacterCardRecord) => {
    try {
      await downloadCardMarkdown(card);
    } catch {
      toast.error(t('characterCards.toast.exportFailed'));
    }
  };

  const handleDelete = async (card: CharacterCardRecord) => {
    const ok = await confirm({
      title: t('characterCards.delete'),
      description: t('characterCards.deleteConfirm', { name: card.name }),
      danger: true,
      confirmText: t('characterCards.delete'),
    });
    if (!ok) return;
    try {
      await mutations.remove.mutateAsync(card.id);
      toast.success(t('characterCards.toast.deleted'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.deleteFailed' }));
    }
  };

  const rowProps = {
    onEdit: (card: CharacterCardRecord) => setEditor({ card }),
    onDuplicate: async (card: CharacterCardRecord) => {
      try {
        await mutations.duplicate.mutateAsync(card.id);
        toast.success(t('characterCards.toast.duplicated'));
      } catch (error) {
        toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
      }
    },
    onExport: handleExport,
    onDelete: handleDelete,
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="character-cards-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3>{t('characterCards.title')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('characterCards.description')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            {t('characterCards.importMd')}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="character-card-create"
            onClick={() => setEditor({ card: null })}
          >
            {t('characterCards.create')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,text/markdown"
            className="hidden"
            data-testid="character-card-import-input"
            onChange={(e) => {
              void handleImportFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <p className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
        {t('characterCards.trustNotice')}
      </p>

      {mounted && isLoading && <Spinner />}
      {mounted && isError && (
        <ErrorState message={t('characterCards.loadError')} onRetry={() => void refetch()} />
      )}
      {mounted && cards && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t('characterCards.sectionBuiltin')}</p>
            <ul className="space-y-2" data-testid="character-card-builtin-list">
              {builtins.map((card) => (
                <CardRow key={card.id} card={card} {...rowProps} />
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t('characterCards.sectionCustom')}</p>
            {customs.length === 0 ? (
              <EmptyState title={t('characterCards.emptyCustom')} />
            ) : (
              <ul className="space-y-2" data-testid="character-card-custom-list">
                {customs.map((card) => (
                  <CardRow key={card.id} card={card} {...rowProps} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <CharacterCardEditorDialog open={editor !== null} onOpenChange={(o) => !o && setEditor(null)} editor={editor} />
    </section>
  );
}
