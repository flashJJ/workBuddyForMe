import { defineRoute } from '@/lib/server/with-api-handler';

export const dynamic = 'force-dynamic';

/** v2.10：下载示例技能能力包（可安装/停用/卸载） */
export const GET = defineRoute(({ services }) => {
  return new Response(services.capabilities.sample() as unknown as BodyInit, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="wbfm-capability-demo.zip"',
      'cache-control': 'no-store',
    },
  });
});
