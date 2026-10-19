import { settingsUpdateSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ services }) => {
  // v2.4 M1 T7：进入应用即记首次启动里程碑（首写优先；仅时间戳，不含对话内容）
  services.settings.markFirstLaunch();
  return jsonOk(services.settings.get());
});

export const PUT = defineRoute(async ({ request, services }) => {
  const input = parseBody(settingsUpdateSchema, await readJsonBody(request));
  return jsonOk(services.settings.update(input));
});
