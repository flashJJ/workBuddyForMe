'use client';

import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import type { WorkflowEndpointView } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
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
  const shownKey = revealedKey ?? '<你的密钥>';
  const curlExample = buildCurlExample(baseUrl, shownKey);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2.5">
      <span className="text-[11px] font-medium text-muted-foreground">调用地址</span>
      <code className="select-all break-all text-[11px] leading-relaxed">
        POST {baseUrl}/flows/{shownKey}/invoke
      </code>
      {endpoint && (
        <div className="mt-1 flex items-center gap-2">
          <KeyRound className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px]">当前密钥：{endpoint.keyPrefix}…（已隐藏）</span>
          <Button
            variant={confirmingRotate ? 'destructive' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onRotate}
            title={confirmingRotate ? '旧密钥将立即失效，再次点击确认' : undefined}
          >
            <RefreshCw className="h-3 w-3" />
            {confirmingRotate ? '再点一次确认重置' : '重置密钥'}
          </Button>
        </div>
      )}
      {revealedKey && (
        <div className="mt-1.5 rounded border border-emerald-300 bg-emerald-50 p-2 dark:bg-emerald-950/30">
          <p className="mb-1 text-[11px] text-emerald-700 dark:text-emerald-400">
            明文密钥只显示这一次，请立即复制保存：
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
              {copied ? '已复制' : '复制'}
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
