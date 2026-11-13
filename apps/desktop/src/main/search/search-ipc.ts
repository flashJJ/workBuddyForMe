import { deploySearxng, type SearxngDeployDeps } from './searxng-deploy';

/**
 * 联网搜索 IPC：一键部署 SearXNG。
 *
 * 部署细节在 searxng-deploy；这里只做通道注册与端口参数校验。
 */
export interface SearchIpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export function registerSearchIpc(ipc: SearchIpcMainLike, deps: SearxngDeployDeps): void {
  ipc.handle('search:deploy-searxng', (_event, port) =>
    deploySearxng({
      ...deps,
      requestedPort: typeof port === 'number' ? port : undefined,
    }),
  );
}
