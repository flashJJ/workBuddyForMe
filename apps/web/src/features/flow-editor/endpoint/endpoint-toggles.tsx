'use client';

import { useI18n } from '@/lib/i18n/use-i18n';

interface EndpointTogglesProps {
  httpEnabled: boolean;
  mcpEnabled: boolean;
  published: boolean;
  onHttpChange: (value: boolean) => void;
  onMcpChange: (value: boolean) => void;
}

/** 本地 API / MCP 暴露开关（流程未发布时禁用） */
export function EndpointToggles({
  httpEnabled,
  mcpEnabled,
  published,
  onHttpChange,
  onMcpChange,
}: EndpointTogglesProps) {
  const { t } = useI18n();
  return (
    <>
      <label className="flex items-center justify-between gap-3">
        <span>
          {t('flowEditor.endpoint.toggles.http')}
          <span className="ml-1 text-[11px] text-muted-foreground">{t('flowEditor.endpoint.toggles.httpHint')}</span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={httpEnabled}
          disabled={!published}
          onChange={(e) => onHttpChange(e.target.checked)}
        />
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>
          {t('flowEditor.endpoint.toggles.mcp')}
          <span className="ml-1 text-[11px] text-muted-foreground">{t('flowEditor.endpoint.toggles.mcpHint')}</span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={mcpEnabled}
          disabled={!published}
          onChange={(e) => onMcpChange(e.target.checked)}
        />
      </label>
    </>
  );
}
