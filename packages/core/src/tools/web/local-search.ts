import type { SearchSettings } from '@wbfm/shared/types';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * v4.16：返回「本机 SearXNG」端点；只有本机端点才允许对话内一键启动。
 * 公网/远程自建实例无法从本机确定进程状态，不触发启动提示。
 */
export function localSearchEndpointOf(settings: SearchSettings): string | undefined {
  if (settings.provider !== 'searxng' || !settings.endpoint.trim()) return undefined;
  try {
    const { hostname } = new URL(settings.endpoint);
    if (!LOCAL_HOSTS.has(hostname.toLowerCase())) return undefined;
    return settings.endpoint;
  } catch {
    return undefined;
  }
}
