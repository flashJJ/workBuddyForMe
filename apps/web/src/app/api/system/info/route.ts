import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { getDataRoot } from '@wbfm/config';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(() =>
  jsonOk({
    dataDir: getDataRoot(),
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.0.0-dev',
    // v0.9：桌面打包态才有 stdio bin（dev/独立 web 为 null，UI 仅展示 HTTP 接入）
    mcp: {
      nodeBin: process.env.WBFM_MCP_NODE ?? null,
      bin: process.env.WBFM_MCP_BIN ?? null,
      dataRoot: getDataRoot(),
    },
  }),
);
