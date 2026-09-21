/**
 * Ollama 地址归一化。
 * 用户通常只填 http://127.0.0.1:11434；对话/向量化走其内置的
 * OpenAI 兼容端点，需要补 /v1；模型列表走原生 /api/tags。
 */
export function normalizeOllamaBaseUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (/\/v1$/i.test(base)) return base;
  return `${base}/v1`;
}

export function normalizeOllamaOrigin(baseUrl: string): string {
  // /api/tags 挂在服务根上：去掉可能被用户带上的 /v1
  return normalizeOllamaBaseUrl(baseUrl).replace(/\/v1$/i, '');
}

export const OLLAMA_NATIVE_ENDPOINTS = {
  tags: '/api/tags',
  version: '/api/version',
} as const;
