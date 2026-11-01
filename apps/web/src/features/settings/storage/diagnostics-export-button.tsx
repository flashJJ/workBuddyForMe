'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';

function readFilename(disposition: string | null): string {
  const match = /filename="?([^";]+)"?/.exec(disposition ?? '');
  return match?.[1] ?? 'wbfm-diagnostics.zip';
}

/** v2.14：设置页导出脱敏诊断包（本地生成 ZIP，不上传） */
export function DiagnosticsExportButton() {
  const { t } = useI18n();
  const toast = useToast();
  const [exporting, setExporting] = React.useState(false);

  const download = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch(API.diagnosticsExport, {
        headers: withManagedHeaders().headers,
      });
      if (!response.ok) {
        let code = '';
        try {
          const payload = (await response.json()) as { error?: { code?: string } };
          code = payload.error?.code ?? '';
        } catch {
          /* 非 JSON 错误体：只显示通用失败 */
        }
        throw new ApiClientError(
          'DIAGNOSTICS_FAILED',
          `${t('about.diagnosticsFailed')}${code ? `（${code}）` : ''}`,
          response.status,
        );
      }
      const blob = await response.blob();
      const filename = readFilename(response.headers.get('content-disposition'));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t('about.diagnosticsDone'));
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('about.diagnosticsFailed'),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-1" data-testid="diagnostics-export-block">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={exporting}
        onClick={() => void download()}
        data-testid="diagnostics-export"
      >
        <Download className="h-3.5 w-3.5" />
        {exporting ? t('about.diagnosticsPending') : t('about.diagnostics')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('about.diagnosticsHint')}</p>
    </div>
  );
}
