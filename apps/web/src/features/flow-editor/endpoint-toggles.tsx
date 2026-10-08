'use client';

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
  return (
    <>
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
          onChange={(e) => onHttpChange(e.target.checked)}
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
          onChange={(e) => onMcpChange(e.target.checked)}
        />
      </label>
    </>
  );
}
