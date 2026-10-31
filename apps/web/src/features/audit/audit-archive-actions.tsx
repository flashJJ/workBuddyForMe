'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { AuditAnchorVerifyResult } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { ApiClientError, apiPost, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';

const CODE_KEYS: Record<AuditAnchorVerifyResult['code'], MessageKey> = {
  ANCHOR_OK: 'audit.anchorOk',
  ANCHOR_TAIL_TRUNCATED: 'audit.anchorTailTruncated',
  ANCHOR_MISMATCH: 'audit.anchorMismatch',
  ANCHOR_CHAIN_BROKEN: 'audit.anchorChainBroken',
};

function readFilename(disposition: string | null): string {
  const match = /filename="?([^";]+)"?/.exec(disposition ?? '');
  return match?.[1] ?? 'audit-archive.zip';
}

/** v2.15：审计页归档导出与外部锚点校验 */
export function AuditArchiveActions({ from, to }: { from: string; to: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [archiving, setArchiving] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [result, setResult] = React.useState<AuditAnchorVerifyResult | null>(null);

  const resolveRange = () => {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 7 * 86_400_000);
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  };

  const exportArchive = async () => {
    if (archiving) return;
    setArchiving(true);
    try {
      const range = resolveRange();
      const response = await fetch(API.auditArchive(range.from, range.to), {
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
          code || 'AUDIT_ARCHIVE_FAILED',
          `${t('audit.archiveFailed')}${code ? `（${code}）` : ''}`,
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
      toast.success(t('audit.archiveDone'));
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('audit.archiveFailed'),
      );
    } finally {
      setArchiving(false);
    }
  };

  const verifyAnchor = async (file: File) => {
    if (verifying) return;
    setVerifying(true);
    setResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const verified = await apiPost<AuditAnchorVerifyResult>(
        API.auditAnchorVerify,
        parsed,
      );
      setResult(verified);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('audit.anchorVerifyFailed'),
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={archiving}
          onClick={() => void exportArchive()}
          data-testid="audit-export-archive"
        >
          {archiving ? t('audit.archivePending') : t('audit.exportArchive')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={verifying}
          onClick={() => inputRef.current?.click()}
          data-testid="audit-anchor-verify"
        >
          {verifying ? t('audit.anchorVerifyPending') : t('audit.anchorVerify')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          data-testid="audit-anchor-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void verifyAnchor(file);
          }}
        />
      </div>
      {result && (
        <p
          className={`max-w-md text-right text-xs ${
            result.ok ? 'text-emerald-700' : 'text-destructive'
          }`}
          data-testid="audit-anchor-result"
        >
          {t(CODE_KEYS[result.code])}
          {result.current.lastSeq !== null && ` · seq ${result.current.lastSeq}`}
        </p>
      )}
    </div>
  );
}
