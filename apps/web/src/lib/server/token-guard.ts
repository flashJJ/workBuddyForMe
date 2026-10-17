import { ApiError } from '@wbfm/shared/errors';

export const TOKEN_HEADER = 'x-wbfm-token';
export const TOKEN_QUERY = 'token';

/** Electron 托管模式（WBFM_SERVER_MANAGED=1）下强制校验启动令牌
 *  接受 header `x-wbfm-token` 或 URL query `?token=`（后者给 three.js GLTFLoader
 *  等不走自定义 fetch 的二进制加载器用——它们没法加自定义 header） */
export function assertToken(request: Request): void {
  if (process.env.WBFM_SERVER_MANAGED !== '1') return;
  const expected = process.env.WBFM_TOKEN;
  if (!expected) throw new ApiError('UNAUTHORIZED', '服务未配置访问令牌');

  const providedHeader = request.headers.get(TOKEN_HEADER);
  const url = new URL(request.url);
  const providedQuery = url.searchParams.get(TOKEN_QUERY);
  const provided = providedHeader ?? providedQuery;

  if (provided !== expected) {
    throw new ApiError('UNAUTHORIZED', '缺失或无效的访问令牌');
  }
}
