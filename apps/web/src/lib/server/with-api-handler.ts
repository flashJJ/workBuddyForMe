import { getServices, type ServiceContainer } from './container';
import { toErrorResponse } from './api-response';
import { assertToken } from './token-guard';

export interface RouteContext<P extends Record<string, string> = Record<string, string>> {
  request: Request;
  params: P;
  services: ServiceContainer;
}

export type RouteHandler<P extends Record<string, string> = Record<string, string>> = (
  context: RouteContext<P>,
) => Promise<Response> | Response;

/**
 * Route Handler 统一包装：
 * 1. Electron 托管模式校验 X-WBFM-Token；
 * 2. 注入服务容器；
 * 3. 统一错误 → 包络响应（422/401/404/500…）。
 */
/**
 * Next 15 的生成类型要求 Route Handler 第二参数为 `{ params: Promise<...> }`（必填）；
 * 单测常只传 request，因此用重载同时兼容两种调用。`Parameters<>` 取最后一个重载，
 * 必须把「带 context」的签名放在最后，才能通过 Next 的 ParamCheck。
 */
export interface RouteEndpoint<P extends Record<string, string> = Record<string, string>> {
  (request: Request): Promise<Response>;
  (request: Request, context: { params: Promise<P> }): Promise<Response>;
}

export function defineRoute<P extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<P>,
): RouteEndpoint<P> {
  const endpoint = async (
    request: Request,
    context: { params?: Promise<P> } = {},
  ): Promise<Response> => {
    try {
      assertToken(request);
      const resolvedParams = context.params
        ? await context.params
        : ({} as P);
      return await handler({
        request,
        params: resolvedParams,
        services: getServices(),
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
  return endpoint as RouteEndpoint<P>;
}
