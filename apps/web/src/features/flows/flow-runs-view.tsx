'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useFlowRuns, useReplayRun, type FlowRunSummary } from '@/lib/hooks/use-flow-runs-center';

const TRIGGER_LABEL: Record<string, string> = {
  manual: '人工',
  chat: '对话',
  api: 'API',
  mcp: 'MCP',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'outline' | 'default'> = {
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'outline',
  interrupted: 'danger',
  queued: 'default',
  running: 'default',
  waiting_human: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
  queued: '排队中',
  running: '运行中',
  waiting_human: '待审批',
};

export function FlowRunsView() {
  const [trigger, setTrigger] = React.useState('');
  const [status, setStatus] = React.useState('');
  const runsQuery = useFlowRuns({ trigger: trigger || undefined, status: status || undefined });
  const replay = useReplayRun();
  const toast = useToast();
  const router = useRouter();

  const runs = runsQuery.data?.runs ?? [];

  const doReplay = async (run: FlowRunSummary, nodeId?: string) => {
    try {
      const result = await replay.mutateAsync({ runId: run.runId, nodeId });
      toast.success(nodeId ? '已从失败节点重放' : '已整体重跑');
      router.push(`/flows/${run.workflowId}?run=${result.runId}`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '重跑失败');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-4 w-4" />
            运行记录
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            全部工作流运行：支持按来源/状态筛选，失败与中断可整体重跑或从失败节点重放。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => runsQuery.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b bg-card px-6 py-2.5 text-xs">
        <span className="text-muted-foreground">来源</span>
        <select
          className="h-8 rounded-md border bg-background px-2"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        >
          <option value="">全部</option>
          <option value="manual">人工</option>
          <option value="chat">对话</option>
          <option value="api">API</option>
          <option value="mcp">MCP</option>
        </select>
        <span className="ml-2 text-muted-foreground">状态</span>
        <select
          className="h-8 rounded-md border bg-background px-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部</option>
          <option value="queued">排队中</option>
          <option value="running">运行中</option>
          <option value="waiting_human">待审批</option>
          <option value="succeeded">成功</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
          <option value="interrupted">已中断</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {runsQuery.isLoading ? (
          <Spinner label="加载运行记录..." />
        ) : runs.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">没有符合条件的运行记录。</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-2 font-medium">状态</th>
                <th className="px-2 py-2 font-medium">工作流</th>
                <th className="px-2 py-2 font-medium">来源</th>
                <th className="px-2 py-2 font-medium">版本</th>
                <th className="px-2 py-2 font-medium">时间</th>
                <th className="px-2 py-2 font-medium">关联/备注</th>
                <th className="px-2 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.runId} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-2 py-2">
                    <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>
                      {STATUS_LABEL[run.status] ?? run.status}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/flows/${run.workflowId}?run=${run.runId}`} className="hover:text-primary">
                      {run.workflowName}
                    </Link>
                    {run.error?.message && (
                      <p className="mt-0.5 max-w-[260px] truncate text-[10px] text-destructive" title={run.error.message}>
                        {run.error.message}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2">{TRIGGER_LABEL[run.trigger] ?? run.trigger}</td>
                  <td className="px-2 py-2 text-muted-foreground">v{run.version}</td>
                  <td className="px-2 py-2 text-muted-foreground">{formatTime(run.createdAt)}</td>
                  <td className="px-2 py-2 text-[10px] text-muted-foreground">
                    {run.resumedFromNode ? (
                      <span title={run.parentRunId ?? ''}>重放自 {run.resumedFromNode}</span>
                    ) : run.parentRunId ? (
                      <span title={run.parentRunId}>整体重跑</span>
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      {run.replayNodeId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          disabled={replay.isPending}
                          onClick={() => doReplay(run, run.replayNodeId ?? undefined)}
                          title={`从失败节点 ${run.replayNodeId} 重放其上游闭包`}
                        >
                          <RotateCcw className="h-3 w-3" />
                          重放节点
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={replay.isPending}
                        onClick={() => doReplay(run)}
                        title="用相同入参整体重跑"
                      >
                        <RotateCcw className="h-3 w-3" />
                        重跑
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
