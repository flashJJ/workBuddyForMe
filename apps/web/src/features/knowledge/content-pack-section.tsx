'use client';

import * as React from 'react';
import { ExternalLink, Loader2, PackageOpen } from 'lucide-react';
import type { ContentPackSummary } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/components/common/toast';
import { useContentPacks, useKnowledgeMutations } from '@/lib/hooks/knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import { cn } from '@/lib/utils';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * v2.18 M4：知识库模板页的内容包入口。
 * 只展示清单与来源/许可/体积；用户确认后才下载，正文不随应用分发。
 */
export function ContentPackSection({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading } = useContentPacks();
  const { importContentPack } = useKnowledgeMutations();
  const [importingId, setImportingId] = React.useState<string | null>(null);

  if (isLoading || !data || data.length === 0) return null;

  const importPack = async (pack: ContentPackSummary): Promise<void> => {
    const confirmed = await confirm({
      title: t('knowledge.contentPack.importTitle'),
      description: t('knowledge.contentPack.importConfirm', {
        source: pack.sourceUrl,
        count: pack.fileCount,
        size: formatSize(pack.totalBytes),
        license: pack.license,
      }),
      confirmText: t('knowledge.contentPack.import'),
    });
    if (!confirmed) return;

    setImportingId(pack.id);
    try {
      await importContentPack.mutateAsync(pack.id);
      toast.success(
        t('knowledge.contentPack.importedToast', {
          name: pack.name,
          count: pack.fileCount,
        }),
      );
    } catch (error) {
      toast.error(
        errorText(error, t, { fallback: 'knowledge.contentPack.importFailed' }),
      );
    } finally {
      setImportingId(null);
    }
  };

  return (
    <section className="space-y-2" data-testid="content-pack-section">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <PackageOpen className="h-3.5 w-3.5" />
        {t('knowledge.contentPack.title')}
      </p>
      {data.map((pack) => (
        <div
          key={pack.id}
          className="space-y-1.5 rounded-md border border-dashed p-2.5"
          data-testid={`content-pack-${pack.id}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 text-sm font-medium">{pack.name}</span>
            <Badge variant="outline" className="shrink-0">
              {t('knowledge.contentPack.badge')}
            </Badge>
          </div>
          <p
            className={cn(
              'text-xs text-muted-foreground',
              compact ? 'line-clamp-2' : 'line-clamp-3',
            )}
          >
            {pack.description}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {pack.license} · {t('knowledge.contentPack.files', { count: pack.fileCount })} ·{' '}
            {formatSize(pack.totalBytes)} ·{' '}
            {t('knowledge.contentPack.version', { version: pack.version })}
          </p>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <a
              href={pack.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {t('knowledge.contentPack.source')}
            </a>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid={`content-pack-import-${pack.id}`}
              disabled={pack.imported || importingId !== null}
              onClick={() => void importPack(pack)}
            >
              {importingId === pack.id && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {pack.imported
                ? t('knowledge.contentPack.imported')
                : importingId === pack.id
                  ? t('knowledge.contentPack.importing')
                  : t('knowledge.contentPack.import')}
            </Button>
          </div>
        </div>
      ))}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t('knowledge.contentPack.disclosure')}
      </p>
    </section>
  );
}
