'use client';

import type { PermissionLevel, ToolTraceEntry } from '@wbfm/shared/types';
import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import { FAILURE_LABEL_KEYS, traceFailureReason, traceState, traceTargetUrl } from './tool-trace-state';

type TFn = (key: MessageKey, vars?: MessageVars) => string;

const SOURCE_LABEL_KEYS: Record<string, MessageKey> = {
  builtin: 'toolTrace.source.builtin',
  unknown: 'toolTrace.source.unknown',
  flow: 'toolTrace.source.flow',
};

export const PERMISSION_LABEL_KEYS: Record<PermissionLevel, MessageKey> = {
  read: 'toolTrace.permission.read',
  write: 'toolTrace.permission.write',
  danger: 'toolTrace.permission.danger',
};

export function sourceLabel(source: string | undefined, t: TFn): string {
  if (!source) return '';
  const key = SOURCE_LABEL_KEYS[source];
  if (key) return t(key);
  if (source.startsWith('mcp:')) return `MCP / ${source.slice(4)}`;
  return source;
}

/** v2.18 M5：证据采集时间（ISO → 本地可读，保留到秒） */
function formatCapturedAt(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19);
}

/**
 * 工具行展开区：参数/结果/证据 + 失败原因归一与可执行动作。
 * v2.23：失败不再只显示服务端原文，收敛成可读原因，并给出「用浏览器打开 / 检查搜索服务」。
 */
export function ToolTraceDetail({ entry, failed }: { entry: ToolTraceEntry; failed: boolean }) {
  const { t } = useI18n();
  const state = traceState(entry);
  const url = traceTargetUrl(entry);
  return (
    <dl className="space-y-1 border-t px-2.5 py-2 text-muted-foreground">
      <div className="flex gap-2">
        <dt className="w-16 shrink-0">{t('toolTrace.detail.toolName')}</dt>
        <dd className="font-mono text-foreground">{entry.tool}</dd>
      </div>
      {entry.source && (
        <div className="flex gap-2">
          <dt className="w-16 shrink-0">{t('toolTrace.detail.source')}</dt>
          <dd>{sourceLabel(entry.source, t)}</dd>
        </div>
      )}
      {entry.permission && (
        <div className="flex gap-2">
          <dt className="w-16 shrink-0">{t('toolTrace.detail.permission')}</dt>
          <dd>{t(PERMISSION_LABEL_KEYS[entry.permission])}</dd>
        </div>
      )}
      {entry.argsSummary && (
        <div className="flex gap-2">
          <dt className="w-16 shrink-0">{t('toolTrace.detail.args')}</dt>
          <dd className="break-all">{entry.argsSummary}</dd>
        </div>
      )}
      <div className="flex gap-2">
        <dt className="w-16 shrink-0">{t('toolTrace.detail.result')}</dt>
        <dd className={cn('break-all', failed && 'text-destructive')}>{entry.resultSummary}</dd>
      </div>
      {entry.evidence && (
        <div className="mt-1 space-y-1 border-t pt-1" data-testid="tool-evidence">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0">{t('toolTrace.evidence.source')}</dt>
            <dd className="min-w-0 break-all">{entry.evidence.source}</dd>
          </div>
          {entry.evidence.coverage && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">{t('toolTrace.evidence.coverage')}</dt>
              <dd className="min-w-0 break-words">{entry.evidence.coverage}</dd>
            </div>
          )}
          {entry.evidence.limitations && entry.evidence.limitations.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">{t('toolTrace.evidence.limitations')}</dt>
              <dd className="min-w-0 break-words text-warning">
                {entry.evidence.limitations.join('；')}
              </dd>
            </div>
          )}
          {entry.evidence.capturedAt && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">{t('toolTrace.evidence.title')}</dt>
              <dd className="min-w-0 text-muted-foreground">
                {t('toolTrace.evidence.capturedAt', {
                  time: formatCapturedAt(entry.evidence.capturedAt),
                })}
              </dd>
            </div>
          )}
        </div>
      )}
      {failed && (
        <div
          className="mt-1 flex flex-wrap items-center gap-3 border-t pt-1"
          data-testid="tool-trace-failure"
        >
          <span className="text-destructive">
            {t(FAILURE_LABEL_KEYS[traceFailureReason(entry)])}
          </span>
          {url && (
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => window.open(url, '_blank', 'noopener')}
            >
              {t('toolTrace.actions.openInBrowser')}
            </button>
          )}
          {state !== 'breaker' && entry.tool === 'web_search' && (
            <a className="underline hover:text-foreground" href="/settings">
              {t('toolTrace.actions.checkSearch')}
            </a>
          )}
        </div>
      )}
    </dl>
  );
}
