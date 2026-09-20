import { ApiError } from '@wbfm/shared';

export const TOKEN_HEADER = 'x-wbfm-token';

/** Electron 托管模式（WBFM_SERVER_MANAGED=1）下强制校验启动令牌 */
export function assertToken(request: Request): void {
  if (process.env.WBFM_SERVER_MANAGED !== '1') return;
  const expected = process.env.WBFM_TOKEN;
  if (!expected) throw new ApiError('UNAUTHORIZED', '服务未配置访问令牌');
  const provided = request.headers.get(TOKEN_HEADER);
  if (provided !== expected) {
    throw new ApiError('UNAUTHORIZED', '缺失或无效的访问令牌');
  }
}
