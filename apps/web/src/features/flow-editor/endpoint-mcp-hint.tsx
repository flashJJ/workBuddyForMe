'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 系统信息（桌面托管态带 stdio bin 路径；dev 下为 null） */
interface SystemInfo {
  mcp: { nodeBin: string | null; bin: string | null; dataRoot: string };
}

/**
 * MCP 客户端接入指引：
 * - HTTP 承载始终可用（自举到「设置 → MCP 服务器」即可）；
 * - stdio 命令行仅桌面打包态可生成（node/bin 路径由主进程注入）。
 * 密钥只在创建/重置当次明文展示，命令行中以 <端点密钥> 占位。
 */
export function EndpointMcpHint({ baseUrl, tokenRevealed }: { baseUrl: string; tokenRevealed: string | null }) {
  const { t } = useI18n();
  const info = useQuery({
    queryKey: ['system-info'],
    queryFn: () => apiGet<SystemInfo>('/api/system/info'),
    staleTime: 60_000,
  });
  const mcp = info.data?.mcp;
  const token = tokenRevealed ?? t('flowEditor.endpoint.mcpHint.tokenPlaceholder');

  const httpConfig = JSON.stringify(
    {
      url: `${baseUrl.replace('/api/public', '')}/api/public/mcp`,
      headers: { Authorization: `Bearer ${token}` },
    },
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2.5 text-[11px] leading-relaxed">
      <p className="font-medium text-foreground">{t('flowEditor.endpoint.mcpHint.title')}</p>
      <div>
        <p className="text-muted-foreground">{t('flowEditor.endpoint.mcpHint.http')}</p>
        <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[10px]">{httpConfig}</pre>
      </div>
      {mcp?.nodeBin && mcp?.bin ? (
        <div>
          <p className="text-muted-foreground">{t('flowEditor.endpoint.mcpHint.stdio')}</p>
          <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[10px]">{JSON.stringify(
            {
              command: mcp.nodeBin,
              args: [mcp.bin],
              env: { WBFM_MCP_TOKEN: token, WBFM_DATA_ROOT: mcp.dataRoot },
            },
            null,
            2,
          )}</pre>
        </div>
      ) : (
        <p className="text-muted-foreground">{t('flowEditor.endpoint.mcpHint.stdioUnavailable')}</p>
      )}
    </div>
  );
}
