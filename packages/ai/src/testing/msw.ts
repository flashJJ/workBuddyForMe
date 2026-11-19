import type { RequestHandler } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * v4.11 P1-1：MSW 共享底座（仅测试使用，不进入 tsup 产物）。
 *
 * 新用例统一用 handler 描述网络，不再 `vi.stubGlobal('fetch', ...)`：
 * - `onUnhandledFrame: 'error'` 让未声明的出网立刻失败，避免测试偷偷打真网；
 * - 每个用例自动 resetHandlers，handler 之间互不影响；
 * - 断言请求体/头/调用次数，直接在 handler 内记录。
 *
 * 用法：
 *   const server = setupMsw([http.post('https://x/v1', () => HttpResponse.json({}))]);
 *   // 单个用例需要覆盖时：server.use(http.get(...))
 */
export function setupMsw(handlers: RequestHandler[] = []) {
  const server = setupServer(...handlers);
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}

export { http, HttpResponse, delay } from 'msw';
export type { JsonBodyType, RequestHandler } from 'msw';
