'use client';

import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import type { WorkflowEndpointView } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { buildCurlExample } from './endpoint-dialog-utils';

interface EndpointInvokeCardProps {
  baseUrl: string;
  endpoint: WorkflowEndpointView | null;
  revealedKey: string | null;
  copied: boolean;
  confirmingRotate: boolean;
  onRotate: () => void;
  onCopy: (text: string) => void;
}

/** 调用地址 / 当前密钥与重置 / 一次性明文密钥 / curl 示例 */
export function EndpointInvokeCard({
  baseUrl,
  endpoint,
  revealedKey,
  copied,
  confirmingRotate,
  onRotate,
  onCopy,
}: EndpointInvokeCardProps) {
  const { t } = useI18n();
  const shownKey = revealedKey ?? t('flowEditor.endpoint.invoke.keyPlaceholder');
  const curlExample = buildCurlExample(baseUrl, shownKey);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2.5">
      <span className="text-[11px] font-medium text-muted-foreground">{t('flowEditor.endpoint.invoke.address')}</span>
      <code className="select-all break-all text-[11px] leading-relaxed">
        POST {baseUrl}/flows/{shownKey}/invoke
      </code>
      {endpoint && (
        <div className="mt-1 flex items-center gap-2">
          <KeyRound className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px]">
            {t('flowEditor.endpoint.invoke.currentKey', { prefix: endpoint.keyPrefix })}
          </span>
          <Button
            variant={confirmingRotate ? 'destructive' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onRotate}
            title={confirmingRotate ? t('flowEditor.endpoint.invoke.rotateConfirmHint') : undefined}
          >
            <RefreshCw className="h-3 w-3" />
            {confirmingRotate ? t('flowEditor.endpoint.invoke.rotateConfirm') : t('flowEditor.endpoint.invoke.rotate')}
          </Button>
        </div>
      )}
      {revealedKey && (
        <div className="mt-1.5 rounded border border-success/30 bg-success-background p-2">
          <p className="mb-1 text-[11px] text-success">
            {t('flowEditor.endpoint.invoke.plaintextWarning')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all break-all text-[11px]">{revealedKey}</code>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onCopy(revealedKey)}
            >
              <Copy className="h-3 w-3" />
              {copied ? t('flowEditor.endpoint.invoke.copied') : t('flowEditor.endpoint.invoke.copy')}
            </Button>
          </div>
        </div>
      )}
      <pre className="mt-1.5 overflow-x-auto rounded bg-background p-2 text-[10px] leading-snug text-muted-foreground">
{curlExample}
      </pre>
    </div>
  );
}
