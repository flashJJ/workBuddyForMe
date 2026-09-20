import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** 健康检查：Electron 启动等待与存活探测使用 */
export const GET = defineRoute(() => {
  return jsonOk({
    status: 'ok',
    time: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
  });
});
