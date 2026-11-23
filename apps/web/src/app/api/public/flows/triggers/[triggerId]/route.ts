import { definePublicTriggerRoute, publicJsonError, publicJsonOk } from '@/lib/server/public-route';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_IDEMPOTENCY_KEY = 128;

/** POST /api/public/flows/triggers/:triggerId：Webhook 触发一次流程运行 */
export const POST = definePublicTriggerRoute(async ({ request, trigger, services }) => {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return publicJsonError('unsupported_media_type', 415, '仅支持 application/json');
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return publicJsonError('payload_too_large', 413, '请求体超过 256KB');
  }
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return publicJsonError('payload_too_large', 413, '请求体超过 256KB');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text || '{}');
  } catch {
    return publicJsonError('validation_failed', 422, '请求体不是合法 JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return publicJsonError('validation_failed', 422, '请求体必须是 JSON 对象');
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || undefined;
  if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY) {
    return publicJsonError('validation_failed', 422, 'Idempotency-Key 过长');
  }

  const result = services.flowTriggers.service.fireWebhook(
    trigger,
    parsed as Record<string, unknown>,
    idempotencyKey,
  );
  if (result.ok) return publicJsonOk({ runId: result.runId }, 202);
  switch (result.reason) {
    case 'duplicate':
      return publicJsonOk({ duplicate: true }, 200);
    case 'busy':
      return publicJsonError('flow_busy', 409, '流程有在途运行，本次事件已跳过');
    case 'disabled':
      return publicJsonError('not_found', 404, '触发器不存在或已禁用');
    case 'not_published':
      return publicJsonError('validation_failed', 422, '工作流尚未发布');
    default:
      return publicJsonError('internal_error', 500, '创建运行失败');
  }
});
