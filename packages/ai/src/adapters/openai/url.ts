/** 拼接 baseUrl（允许用户带/不带尾斜杠、/v1 前缀）与端点路径 */
export function joinEndpoint(baseUrl: string, endpoint: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}

export const OPENAI_ENDPOINTS = {
  chatCompletions: '/chat/completions',
  embeddings: '/embeddings',
  models: '/models',
} as const;
