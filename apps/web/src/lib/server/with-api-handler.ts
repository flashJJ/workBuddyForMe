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
export function defineRoute<P extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<P>,
) {
  return async (
    request: Request,
    context: { params?: P | Promise<P> } = {},
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
}
