'use client';

import * as React from 'react';
import type { DebugToolInfo, ToolResult } from '@wbfm/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useToolDebugExecute, useToolDebugList } from '@/lib/hooks/use-tool-debug';

function sourceBadgeVariant(source: string): 'default' | 'success' | 'warning' | 'danger' {
  if (source === 'builtin') return 'success';
  return 'warning';
}

function formatResult(result: ToolResult): string {
  return [
    `状态：${result.ok ? '成功' : '失败'}`,
    `摘要：${result.summary}`,
    '',
    '输出：',
    result.output,
  ].join('\n');
}

export function ToolDebugPanel() {
  const { data: tools, isLoading } = useToolDebugList();
  const execute = useToolDebugExecute();
  const toast = useToast();

  const [selected, setSelected] = React.useState<string>('');
  const [argsText, setArgsText] = React.useState('{}');
  const [result, setResult] = React.useState<ToolResult | null>(null);

  // 默认选第一个工具
  React.useEffect(() => {
    if (!selected && tools && tools.length > 0) {
      setSelected(tools[0]!.name);
    }
  }, [tools, selected]);

  const currentTool = tools?.find((t) => t.name === selected);

  const onExecute = async () => {
    let args: unknown = {};
    try {
      args = argsText.trim() ? JSON.parse(argsText) : {};
    } catch {
      toast.error('参数不是合法 JSON');
      return;
    }
    try {
      const r = await execute.mutateAsync({ name: selected, args });
      setResult(r);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '执行失败');
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">工具调试台</h2>
        <p className="text-sm text-muted-foreground">
          选择工具并填参试跑，不经模型/熔断/权限门控；MCP 工具超时 60s。
        </p>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && tools && tools.length === 0 && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          暂无可调试工具。内置工具默认可用；MCP 工具需先在「设置 → MCP」中连接服务器。
        </p>
      )}

      {!isLoading && tools && tools.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">工具</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              data-testid="tool-debug-select"
            >
              {Object.entries(
                tools.reduce<Record<string, DebugToolInfo[]>>((acc, t) => {
                  (acc[t.source] ??= []).push(t);
                  return acc;
                }, {}),
              ).map(([source, group]) => (
                <optgroup key={source} label={source}>
                  {group.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {currentTool && (
            <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sourceBadgeVariant(currentTool.source)}>
                  {currentTool.source}
                </Badge>
                <Badge variant={currentTool.permission === 'danger' ? 'danger' : 'default'}>
                  {currentTool.permission}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{currentTool.description}</p>
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">参数 Schema</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/40 p-2 text-[11px]">
                  {JSON.stringify(currentTool.parameters, null, 2)}
                </pre>
              </details>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">参数（JSON）</label>
            <textarea
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={6}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              data-testid="tool-debug-args"
              placeholder='{"url": "https://example.com"}'
            />
          </div>

          <Button
            type="button"
            onClick={() => void onExecute()}
            disabled={execute.isPending || !selected}
            data-testid="tool-debug-execute"
          >
            {execute.isPending ? '执行中…' : '执行'}
          </Button>

          {result && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">结果</label>
              <pre
                className="max-h-72 overflow-auto rounded-md border bg-muted/20 p-3 text-xs"
                data-testid="tool-debug-result"
              >
                {formatResult(result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
