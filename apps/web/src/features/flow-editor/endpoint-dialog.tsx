'use client';

import * as React from 'react';
import { useToast } from '@/components/common/toast';
import {
  FLOW_ENDPOINT_RATE_LIMIT,
  FLOW_ENDPOINT_SYNC_TIMEOUT,
} from '@wbfm/shared/schemas';
import { type FlowUnattendedPolicy } from '@wbfm/shared/types';
// 策略编辑 UI 在 EndpointPolicySection；白名单过滤见 endpoint-dialog-utils
import { ApiClientError } from '@/lib/api/client';
import { copyText } from '@/lib/utils/clipboard';
import {
  useFlowEndpoint,
  useFlowEndpointMutations,
  type FlowEndpointConfigInput,
} from '@/lib/hooks/use-flow-endpoint';
import { EndpointMcpHint } from './endpoint-mcp-hint';
import { EndpointPolicySection } from './endpoint-policy-section';
import { EndpointToggles } from './endpoint-toggles';
import { EndpointInvokeCard } from './endpoint-invoke-card';
import {
  TIMEOUT_OPTIONS,
  buildEffectivePolicy,
  clampRateLimit,
  getEndpointBaseUrl,
} from './endpoint-dialog-utils';
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
  const toast = useToast();
  const ep = detail.data?.endpoint ?? null;

  const [httpEnabled, setHttpEnabled] = React.useState(false);
  const [mcpEnabled, setMcpEnabled] = React.useState(false);
  const [timeoutMs, setTimeoutMs] = React.useState<number>(FLOW_ENDPOINT_SYNC_TIMEOUT.default);
  const [rateLimit, setRateLimit] = React.useState<number>(FLOW_ENDPOINT_RATE_LIMIT.default);
  /** 创建/重置当次返回的明文密钥（不落任何持久存储） */
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  /** 无人值守策略（默认 deny_all；allowlist 仅允许勾选当前图中的危险工具） */
  const [policy, setPolicy] = React.useState<FlowUnattendedPolicy>({ mode: 'deny_all' });
  /** 重置密钥二次确认（内联，避免 Electron 下 window.confirm 抢走键盘焦点） */
  const [confirmingRotate, setConfirmingRotate] = React.useState(false);

  React.useEffect(() => {
    if (!open) setConfirmingRotate(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setHttpEnabled(ep?.httpEnabled ?? false);
    setMcpEnabled(ep?.mcpEnabled ?? false);
    setTimeoutMs(ep?.syncTimeoutMs ?? FLOW_ENDPOINT_SYNC_TIMEOUT.default);
    setRateLimit(ep?.rateLimitPerMin ?? FLOW_ENDPOINT_RATE_LIMIT.default);
    setRevealedKey(null);
    setCopied(false);
    setPolicy(ep?.policy ?? { mode: 'deny_all' });
  }, [open, ep]);

  const baseUrl = getEndpointBaseUrl();

  const onCopy = async (text: string) => {
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const save = async () => {
    if (!httpEnabled && !mcpEnabled && !ep) return;
    const graphTools = new Set((detail.data?.dangerNodes ?? []).map((n) => n.toolName));
    const effectivePolicy = buildEffectivePolicy(policy, graphTools);
    const body: FlowEndpointConfigInput = {
      httpEnabled,
      mcpEnabled,
      syncTimeoutMs: timeoutMs,
      rateLimitPerMin: clampRateLimit(rateLimit),
      policy: effectivePolicy,
    };
    try {
      const result = await mutations.save.mutateAsync(body);
      if (result.plaintextKey) setRevealedKey(result.plaintextKey);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '保存失败');
    }
  };

  const rotate = async () => {
    if (!ep) return;
    // 二次点击确认：旧密钥即时失效，避免误触；不使用原生 confirm（会抢 Electron 键盘焦点）
    if (!confirmingRotate) {
      setConfirmingRotate(true);
      window.setTimeout(() => setConfirmingRotate(false), 4000);
      return;
    }
    setConfirmingRotate(false);
    try {
      const result = await mutations.rotate.mutateAsync();
      setRevealedKey(result.plaintextKey ?? null);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '重置失败');
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
        {ep?.policyRevalidationRequired && (
          <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30">
            流程发布了新版本：请重新核对下方无人值守策略并「保存配置」，保存前所有 API/MCP
            调用将被拒绝（409 需重新确认策略）。
          </p>
        )}

        <div className="flex flex-col gap-4 text-sm">
          <EndpointToggles
            httpEnabled={httpEnabled}
            mcpEnabled={mcpEnabled}
            published={published}
            onHttpChange={setHttpEnabled}
            onMcpChange={setMcpEnabled}
          />

          {(httpEnabled || mcpEnabled) && (
            <>
              <EndpointInvokeCard
                baseUrl={baseUrl}
                endpoint={ep}
                revealedKey={revealedKey}
                copied={copied}
                confirmingRotate={confirmingRotate}
                onRotate={rotate}
                onCopy={onCopy}
              />

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

              <EndpointPolicySection
                policy={policy}
                dangerNodes={dangerNodes}
                onChange={setPolicy}
              />
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
