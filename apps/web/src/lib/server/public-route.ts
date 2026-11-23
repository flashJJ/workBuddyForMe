import { PublicEndpointError, StartInputValidationError } from '@wbfm/core/serving';
import { getServices, type ServiceContainer } from './container';
import type { EndpointTransport } from '@wbfm/core/serving';
import type { WorkflowEndpointView } from '@wbfm/shared/types';
import type { FlowTriggerView } from '@wbfm/shared/types';

/**
 * v0.9 公开路由组（/api/public/**）：
 * 与内部 defineRoute 完全分离——不读不写会话、不接受托管 token/cookie，
 * 链路固定为 hostGuard → bearerAuth → rateLimit → handler。
 * 错误体沿用统一包络 {success:false,error:{code,message}}，code 用公开错误码表。
 */

export interface PublicRouteContext<P extends Record<string, string> = Record<string, string>> {
  request: Request;
  params: P;
  services: ServiceContainer;
  endpoint: WorkflowEndpointView;
}

export type PublicRouteHandler<P extends Record<string, string> = Record<string, string>> = (
  context: PublicRouteContext<P>,
) => Promise<Response> | Response;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

export function publicJsonError(
  code: string,
  status: number,
  message: string,
  details?: unknown,
  init?: { headers?: Record<string, string> },
): Response {
  // 公开错误码（unauthorized/rate_limited…）不沿用内部 ErrorCode 枚举，
  // 但响应包络形状与内部一致：{success:false,error:{code,message,details?}}
  const body: { success: false; error: { code: string; message: string; details?: unknown } } = {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...(init?.headers ?? {}) },
  });
}

export function publicJsonOk<T>(
  data: T,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...JSON_HEADERS, ...(extraHeaders ?? {}) },
  });
}

/**
 * 跨 bundle/HMR 的错误识别：transpilePackages 使 @wbfm/core 在各路由按需编译产物中
 * 可能存在多份类声明（全局容器持有旧 chunk 的实例），instanceof 偶发失配；
 * 以稳定的 name + 结构化字段兜底。
 */
function asPublicEndpointError(error: unknown): PublicEndpointError | null {
  if (error instanceof PublicEndpointError) return error;
  if (
    error &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'PublicEndpointError'
  ) {
    const candidate = error as PublicEndpointError;
    if (typeof candidate.code === 'string' && typeof candidate.status === 'number') {
      return candidate;
    }
  }
  return null;
}

function asStartInputError(error: unknown): StartInputValidationError | null {
  if (error instanceof StartInputValidationError) return error;
  if (
    error &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'StartInputValidationError'
  ) {
    return error as StartInputValidationError;
  }
  return null;
}

/**
 * DNS rebinding 防护：公开面只接受环回 Host。
 * 允许 127.0.0.1[:port] / localhost[:port]；缺失或其他 Host 一律拒绝。
 */
function assertLoopbackHost(request: Request): void {
  // 真实 HTTP 服务以 Host 头为准（DNS rebinding 攻击面）；
  // 测试环境（undici Request）不透传 Host 头时回退到请求 URL。
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (!host) {
    throw new PublicEndpointError('invalid_host', 403, '缺少 Host 头');
  }
  const hostname = (host.split(':')[0] ?? '').toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new PublicEndpointError('invalid_host', 403, '公开 API 仅允许本机（127.0.0.1/localhost）访问');
  }
}

/**
 * Next 15 的生成类型要求第二参数为 `{ params: Promise<...> }`（必填）；
 * 单测常只传 request，因此用重载兼容两种调用。`Parameters<>` 取最后一个重载，
 * 带 context 的签名必须放在最后。
 */
export interface PublicEndpoint<P extends Record<string, string> = Record<string, string>> {
  (request: Request): Promise<Response>;
  (request: Request, context: { params: Promise<P> }): Promise<Response>;
}

export function definePublicRoute<P extends Record<string, string> = Record<string, string>>(
  transport: EndpointTransport,
  handler: PublicRouteHandler<P>,
): PublicEndpoint<P> {
  const endpoint = async (
    request: Request,
    context: { params?: P | Promise<P> } = {},
  ): Promise<Response> => {
    let services: ServiceContainer | null = null;
    try {
      assertLoopbackHost(request);
      services = getServices();
      const endpoint = services.endpoints.authenticate(
        request.headers.get('authorization'),
        transport,
      );
      const decision = services.rateLimiter.check(endpoint.id, endpoint.rateLimitPerMin);
      if (!decision.allowed) {
        return publicJsonError('rate_limited', 429, '调用过于频繁，请稍后再试', undefined, {
          headers: { 'retry-after': String(decision.retryAfterSec) },
        });
      }
      const rawParams = context.params;
      const params: P = rawParams ? await rawParams : ({} as P);
      return await handler({ request, params, services, endpoint });
    } catch (error) {
      const publicError = asPublicEndpointError(error);
      if (publicError) {
        return publicJsonError(publicError.code, publicError.status, publicError.message);
      }
      const inputError = asStartInputError(error);
      if (inputError) {
        return publicJsonError('validation_failed', 422, inputError.message, inputError.details);
      }
      console.error('[public-api] 未处理错误：', error);
      return publicJsonError('internal_error', 500, '服务器内部错误');
    }
  };
  return endpoint as PublicEndpoint<P>;
}

/* ───────────── v4.25 事件触发公开面：Host → Secret → 限流 → handler ───────────── */

export interface PublicTriggerRouteContext<P extends Record<string, string> = Record<string, string>> {
  request: Request;
  params: P;
  services: ServiceContainer;
  trigger: FlowTriggerView;
}

export type PublicTriggerRouteHandler<P extends Record<string, string> = Record<string, string>> = (
  context: PublicTriggerRouteContext<P>,
) => Promise<Response> | Response;

const TRIGGER_RATE_LIMIT_PER_MIN = 30;

/**
 * Webhook 触发公开路由：
 * - 与端点公开面共用回环 Host 守卫与统一错误包络；
 * - 鉴权走触发器一次性 Secret（Bearer），不复用端点密钥。
 */
export function definePublicTriggerRoute<P extends Record<string, string> = Record<string, string>>(
  handler: PublicTriggerRouteHandler<P>,
): PublicEndpoint<P> {
  const route = async (
    request: Request,
    context: { params?: P | Promise<P> } = {},
  ): Promise<Response> => {
    try {
      assertLoopbackHost(request);
      const services = getServices();
      const rawParams = context.params;
      const params: P = rawParams ? await rawParams : ({} as P);
      const triggerId = params.triggerId;
      if (!triggerId) return publicJsonError('not_found', 404, '触发器不存在');

      const declared = Number(request.headers.get('content-length') ?? '0');
      if (Number.isFinite(declared) && declared > 256 * 1024) {
        return publicJsonError('payload_too_large', 413, '请求体超过 256KB');
      }
      // v5.0：HMAC 验签需要原始 body；clone 后读取，不消耗下游 handler 的请求体
      const rawBody = await request.clone().text();
      const auth = services.flowTriggers.service.authenticateWebhook(
        triggerId,
        request.headers.get('authorization'),
        {
          rawBody,
          timestamp: request.headers.get('x-wbfm-timestamp'),
          signature: request.headers.get('x-wbfm-signature'),
        },
      );
      if (!auth.ok) {
        return auth.reason === 'not_found'
          ? publicJsonError('not_found', 404, '触发器不存在或已禁用')
          : publicJsonError('unauthorized', 401, 'Secret 无效');
      }
      const decision = services.rateLimiter.check(
        `flow-trigger:${triggerId}`,
        TRIGGER_RATE_LIMIT_PER_MIN,
      );
      if (!decision.allowed) {
        return publicJsonError('rate_limited', 429, '调用过于频繁，请稍后再试', undefined, {
          headers: { 'retry-after': String(decision.retryAfterSec) },
        });
      }
      return await handler({ request, params, services, trigger: auth.trigger });
    } catch (error) {
      const publicError = asPublicEndpointError(error);
      if (publicError) {
        return publicJsonError(publicError.code, publicError.status, publicError.message);
      }
      console.error('[flow-trigger] 未处理错误：', error);
      return publicJsonError('internal_error', 500, '服务器内部错误');
    }
  };
  return route as PublicEndpoint<P>;
}
