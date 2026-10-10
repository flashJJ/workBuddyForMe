'use client';

import * as React from 'react';
import type { DebugToolInfo, ToolResult } from '@wbfm/core/tools';
import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToolDebugExecute, useToolDebugList } from '@/lib/hooks/use-tool-debug';

/** useI18n 返回的翻译函数形状（模块级 helper 需经调用方传入） */
type TFn = (key: MessageKey, vars?: MessageVars) => string;

function sourceBadgeVariant(source: string): 'default' | 'success' | 'warning' | 'danger' {
  if (source === 'builtin') return 'success';
  return 'warning';
}

function formatResult(result: ToolResult, t: TFn): string {
  return [
    t(result.ok ? 'toolDebug.format.statusOk' : 'toolDebug.format.statusFailed'),
    t('toolDebug.format.summary', { summary: result.summary }),
    '',
    t('toolDebug.format.output'),
    result.output,
  ].join('\n');
}

export function ToolDebugPanel() {
  const { t } = useI18n();
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

  const currentTool = tools?.find((tool) => tool.name === selected);

  const onExecute = async () => {
    let args: unknown = {};
    try {
      args = argsText.trim() ? JSON.parse(argsText) : {};
    } catch {
      toast.error(t('toolDebug.invalidJson'));
      return;
    }
    try {
      const r = await execute.mutateAsync({ name: selected, args });
      setResult(r);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('toolDebug.executeFailed'));
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{t('toolDebug.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('toolDebug.description')}
        </p>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && tools && tools.length === 0 && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t('toolDebug.empty')}
        </p>
      )}

      {!isLoading && tools && tools.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="tool-debug-select" className="text-xs font-medium text-muted-foreground">
              {t('toolDebug.toolLabel')}
            </label>
            <select
              id="tool-debug-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              data-testid="tool-debug-select"
            >
              {Object.entries(
                tools.reduce<Record<string, DebugToolInfo[]>>((acc, item) => {
                  (acc[item.source] ??= []).push(item);
                  return acc;
                }, {}),
              ).map(([source, group]) => (
                <optgroup key={source} label={source}>
                  {group.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
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
                <summary className="cursor-pointer text-muted-foreground">{t('toolDebug.argsSchema')}</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/40 p-2 text-[11px]">
                  {JSON.stringify(currentTool.parameters, null, 2)}
                </pre>
              </details>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('toolDebug.argsJson')}</label>
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
            {execute.isPending ? t('toolDebug.executing') : t('toolDebug.execute')}
          </Button>

          {result && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('toolDebug.resultLabel')}</label>
              <pre
                className="max-h-72 overflow-auto rounded-md border bg-muted/20 p-3 text-xs"
                data-testid="tool-debug-result"
              >
                {formatResult(result, t)}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
