import { PublicEndpointError, StartInputValidationError } from '@wbfm/core/serving';
import { getServices, type ServiceContainer } from './container';
import type { EndpointTransport } from '@wbfm/core/serving';
import type { WorkflowEndpointView } from '@wbfm/shared/types';

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

export function definePublicRoute<P extends Record<string, string> = Record<string, string>>(
  transport: EndpointTransport,
  handler: PublicRouteHandler<P>,
) {
  return async (
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
}
