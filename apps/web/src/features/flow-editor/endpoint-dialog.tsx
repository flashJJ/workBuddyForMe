'use client';

import * as React from 'react';
import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import { FLOW_ENDPOINT_RATE_LIMIT, FLOW_ENDPOINT_SYNC_TIMEOUT } from '@wbfm/shared';
import { ApiClientError } from '@/lib/api/client';
import { copyText } from '@/lib/utils/clipboard';
import {
  useFlowEndpoint,
  useFlowEndpointMutations,
  type FlowEndpointConfigInput,
} from '@/lib/hooks/use-flow-endpoint';
import { EndpointMcpHint } from './endpoint-mcp-hint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const TIMEOUT_OPTIONS = [5_000, 10_000, 30_000, 60_000, 120_000];

export interface EndpointDialogProps {
  open: boolean;
  workflowId: string;
  published: boolean;
  onClose: () => void;
}

/** 对外服务端点管理：开关/密钥（一次明文）/同步超时/限速 + 危险节点提示（策略白名单 M4 提供） */
export function EndpointDialog({ open, workflowId, published, onClose }: EndpointDialogProps) {
  const detail = useFlowEndpoint(open ? workflowId : null);
  const mutations = useFlowEndpointMutations(workflowId);
  const ep = detail.data?.endpoint ?? null;

  const [httpEnabled, setHttpEnabled] = React.useState(false);
  const [mcpEnabled, setMcpEnabled] = React.useState(false);
  const [timeoutMs, setTimeoutMs] = React.useState<number>(FLOW_ENDPOINT_SYNC_TIMEOUT.default);
  const [rateLimit, setRateLimit] = React.useState<number>(FLOW_ENDPOINT_RATE_LIMIT.default);
  /** 创建/重置当次返回的明文密钥（不落任何持久存储） */
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setHttpEnabled(ep?.httpEnabled ?? false);
    setMcpEnabled(ep?.mcpEnabled ?? false);
    setTimeoutMs(ep?.syncTimeoutMs ?? FLOW_ENDPOINT_SYNC_TIMEOUT.default);
    setRateLimit(ep?.rateLimitPerMin ?? FLOW_ENDPOINT_RATE_LIMIT.default);
    setRevealedKey(null);
    setCopied(false);
  }, [open, ep]);

  const baseUrl =
    typeof window === 'undefined'
      ? 'http://127.0.0.1:3000/api/public'
      : `${window.location.origin}/api/public`;
  const shownKey = revealedKey ?? '<你的密钥>';
  const curlExample = `curl -X POST ${baseUrl}/flows/${shownKey}/invoke \\
  -H "Authorization: Bearer ${shownKey}" \\
  -H "Content-Type: application/json" \\
  -d '{}'`;

  const onCopy = async (text: string) => {
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const save = async () => {
    if (!httpEnabled && !mcpEnabled && !ep) return;
    const body: FlowEndpointConfigInput = {
      httpEnabled,
      mcpEnabled,
      syncTimeoutMs: timeoutMs,
      rateLimitPerMin: Math.min(
        FLOW_ENDPOINT_RATE_LIMIT.max,
        Math.max(FLOW_ENDPOINT_RATE_LIMIT.min, Math.floor(rateLimit) || FLOW_ENDPOINT_RATE_LIMIT.default),
      ),
    };
    try {
      const result = await mutations.save.mutateAsync(body);
      if (result.plaintextKey) setRevealedKey(result.plaintextKey);
    } catch (error) {
      window.alert(error instanceof ApiClientError ? error.message : '保存失败');
    }
  };

  const rotate = async () => {
    if (!ep) return;
    if (!window.confirm('重置后旧密钥立即失效，使用旧密钥的调用方都会被拒绝。确定重置？')) return;
    try {
      const result = await mutations.rotate.mutateAsync();
      setRevealedKey(result.plaintextKey ?? null);
    } catch (error) {
      window.alert(error instanceof ApiClientError ? error.message : '重置失败');
    }
  };

  const dangerNodes = detail.data?.dangerNodes ?? [];
  const saving = mutations.save.isPending || mutations.rotate.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>对外服务</DialogTitle>
          <DialogDescription>
            把已发布流程暴露为本机 HTTP API（仅 127.0.0.1 可访问），独立密钥、可随时吊销。
          </DialogDescription>
        </DialogHeader>

        {!published && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30">
            流程尚未发布：请先在工具栏「发布」当前版本，发布后才能开启对外调用。
          </p>
        )}

        <div className="flex flex-col gap-4 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>
              本地 API
              <span className="ml-1 text-[11px] text-muted-foreground">HTTP invoke / 轮询 / SSE</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={httpEnabled}
              disabled={!published}
              onChange={(e) => setHttpEnabled(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>
              MCP 暴露
              <span className="ml-1 text-[11px] text-muted-foreground">供 MCP 客户端发现调用（配置先行，服务 M3 上线）</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={mcpEnabled}
              disabled={!published}
              onChange={(e) => setMcpEnabled(e.target.checked)}
            />
          </label>

          {(httpEnabled || mcpEnabled) && (
            <>
              <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">调用地址</span>
                <code className="select-all break-all text-[11px] leading-relaxed">
                  POST {baseUrl}/flows/{shownKey}/invoke
                </code>
                {ep && (
                  <div className="mt-1 flex items-center gap-2">
                    <KeyRound className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px]">当前密钥：{ep.keyPrefix}…（已隐藏）</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={rotate}>
                      <RefreshCw className="h-3 w-3" />
                      重置密钥
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

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium">同步等待超时</span>
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  >
                    {TIMEOUT_OPTIONS.map((ms) => (
                      <option key={ms} value={ms}>
                        {ms / 1000} 秒（超时自动转异步）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium">速率限制（次/分钟）</span>
                  <Input
                    type="number"
                    min={FLOW_ENDPOINT_RATE_LIMIT.min}
                    max={FLOW_ENDPOINT_RATE_LIMIT.max}
                    value={rateLimit}
                    className="h-9 text-sm"
                    onChange={(e) => setRateLimit(Number(e.target.value))}
                  />
                </label>
              </div>

              <EndpointMcpHint baseUrl={baseUrl} tokenRevealed={revealedKey} />

              <div className="rounded-md border p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">无人值守危险操作策略</p>
                <p className="mt-1">
                  当前默认「拒绝全部写入/高危操作」；白名单配置将在 v0.9 后续版本提供。
                </p>
                {dangerNodes.length > 0 && (
                  <p className="mt-1 text-amber-600 dark:text-amber-400">
                    ⚠ 当前发布图含 {dangerNodes.length} 个写入/高危节点：
                    {dangerNodes.map((n) => `${n.toolName}(${n.permission})`).join('、')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={save} disabled={saving || !published || (!httpEnabled && !mcpEnabled)}>
            {saving ? '保存中…' : '保存配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
