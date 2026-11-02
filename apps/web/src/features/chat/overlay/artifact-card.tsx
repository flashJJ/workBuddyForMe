'use client';

import * as React from 'react';
import type { ArtifactRef } from '@wbfm/shared/types';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { withManagedHeaders } from '@/lib/api/client';
import { downloadApiFile } from '@/lib/api/download';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** v2.18：工具产出的文件卡片；预览走带令牌 fetch + sandbox iframe，下载走 blob */
export function ArtifactCard({ artifact }: { artifact: ArtifactRef }) {
  const { t } = useI18n();
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

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
      {failed && <p className="mt-1 text-destructive">{t('toolTrace.artifact.failed')}</p>}
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
