'use client';

import * as React from 'react';
import type { ArtifactRef } from '@wbfm/shared/types';
import { Download, Eye, FileDown, FileText, ImageDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { withManagedHeaders } from '@/lib/api/client';
import { downloadApiFile } from '@/lib/api/download';
import {
  downloadBlobFile,
  exportFileName,
  extractArtifactSvg,
  rasterizeSvg,
} from './artifact-export';

type ExportKind = 'svg' | 'png';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** v2.18：工具产出的文件卡片；预览走带令牌 fetch + sandbox iframe，下载/导出走 blob */
export function ArtifactCard({ artifact }: { artifact: ArtifactRef }) {
  const { t } = useI18n();
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [exporting, setExporting] = React.useState<ExportKind | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const canExport = artifact.format !== 'md';

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const togglePreview = async (): Promise<void> => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/artifacts/${artifact.attachmentId}`, {
        headers: withManagedHeaders().headers,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPreviewUrl(URL.createObjectURL(await response.blob()));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const download = (): void => {
    setFailed(false);
    void downloadApiFile(
      `/api/artifacts/${artifact.attachmentId}?download=1`,
      artifact.filename,
    ).catch(() => setFailed(true));
  };

  /** M3：仅图表产物（html 内联 SVG / svg）可导出；失败给出明确文案 */
  const exportArtifact = async (kind: ExportKind): Promise<void> => {
    setExporting(kind);
    setExportError(null);
    try {
      const response = await fetch(`/api/artifacts/${artifact.attachmentId}`, {
        headers: withManagedHeaders().headers,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = extractArtifactSvg(await response.text(), artifact.format);
      if (!parsed) {
        setExportError(t('toolTrace.artifact.noSvg'));
        return;
      }
      if (kind === 'svg') {
        downloadBlobFile(
          new Blob([parsed.svg], { type: 'image/svg+xml;charset=utf-8' }),
          exportFileName(artifact.filename, 'svg'),
        );
        return;
      }
      downloadBlobFile(
        await rasterizeSvg(parsed, 2),
        exportFileName(artifact.filename, 'png'),
      );
    } catch {
      setExportError(t('toolTrace.artifact.exportFailed'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div
      className="rounded-md border bg-background p-2 text-xs"
      data-testid="artifact-card"
      data-artifact-id={artifact.attachmentId}
    >
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{artifact.title}</p>
          <p className="text-muted-foreground">
            {artifact.format.toUpperCase()} · {formatBytes(artifact.byteSize)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={togglePreview} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {previewUrl ? t('toolTrace.artifact.hidePreview') : t('toolTrace.artifact.preview')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="h-3.5 w-3.5" />
          {t('toolTrace.artifact.download')}
        </Button>
      </div>
      {canExport && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void exportArtifact('svg')}
            disabled={exporting !== null}
          >
            {exporting === 'svg' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            {exporting === 'svg'
              ? t('toolTrace.artifact.exporting')
              : t('toolTrace.artifact.exportSvg')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void exportArtifact('png')}
            disabled={exporting !== null}
          >
            {exporting === 'png' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageDown className="h-3.5 w-3.5" />
            )}
            {exporting === 'png'
              ? t('toolTrace.artifact.exporting')
              : t('toolTrace.artifact.exportPng')}
          </Button>
        </div>
      )}
      {failed && <p className="mt-1 text-destructive">{t('toolTrace.artifact.failed')}</p>}
      {exportError && (
        <p className="mt-1 text-destructive" role="alert">
          {exportError}
        </p>
      )}
      {previewUrl && (
        <iframe
          title={artifact.title}
          sandbox=""
          src={previewUrl}
          className="mt-2 h-96 w-full rounded border bg-white"
        />
      )}
    </div>
  );
}
