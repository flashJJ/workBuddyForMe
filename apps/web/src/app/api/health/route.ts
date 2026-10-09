import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** 健康检查：Electron 启动等待与存活探测使用 */
export const GET = defineRoute(() => {
  return jsonOk({
    status: 'ok',
    time: new Date().toISOString(),
    // 打包态由桌面壳注入 APP_VERSION；dev/独立 web 回落 npm 包版本
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.0.0-dev',
  });
});
