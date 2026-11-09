'use client';

import * as React from 'react';
import { ExternalLink, Loader2, PackageOpen, RefreshCw } from 'lucide-react';
import type { ContentPackSummary, ContentPackUpdateCheck } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/components/common/toast';
import {
  useContentPackUpdateCheck,
  useContentPacks,
  useKnowledgeMutations,
} from '@/lib/hooks/knowledge';
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
  const checkUpdate = useContentPackUpdateCheck();
  const [importingId, setImportingId] = React.useState<string | null>(null);
  const [checkingId, setCheckingId] = React.useState<string | null>(null);
  const [checkResults, setCheckResults] = React.useState<Record<string, ContentPackUpdateCheck>>(
    {},
  );

  if (isLoading || !data || data.length === 0) return null;

  /** v2.30：手动检查更新；只在点击时请求一次，不自动轮询 */
  const runUpdateCheck = async (pack: ContentPackSummary): Promise<void> => {
    setCheckingId(pack.id);
    try {
      const result = await checkUpdate.mutateAsync(pack.id);
      setCheckResults((prev) => ({ ...prev, [pack.id]: result }));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'knowledge.contentPack.updateCheckFailed' }));
    } finally {
      setCheckingId(null);
    }
  };

  const updateText = (result: ContentPackUpdateCheck): string =>
    result.status === 'latest'
      ? t('knowledge.contentPack.updateLatest', { version: result.currentVersion })
      : result.status === 'update-available'
        ? t('knowledge.contentPack.updateAvailable', {
            current: result.currentVersion,
            latest: result.latestVersion ?? '—',
          })
        : t('knowledge.contentPack.updateUnavailable', { reason: result.reason ?? '—' });

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
          {checkResults[pack.id] && (
            <p
              className={cn(
                'text-[11px]',
                checkResults[pack.id]!.status === 'update-available'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground',
              )}
              data-testid={`content-pack-update-${pack.id}`}
            >
              {updateText(checkResults[pack.id]!)}
            </p>
          )}
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
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-testid={`content-pack-check-${pack.id}`}
                disabled={checkingId !== null || importingId !== null}
                onClick={() => void runUpdateCheck(pack)}
              >
                {checkingId === pack.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {checkingId === pack.id
                  ? t('knowledge.contentPack.checkingUpdate')
                  : t('knowledge.contentPack.checkUpdate')}
              </Button>
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
        </div>
      ))}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t('knowledge.contentPack.disclosure')}
      </p>
    </section>
  );
}
