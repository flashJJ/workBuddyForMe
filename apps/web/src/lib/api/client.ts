import { unwrapEnvelope, type ApiEnvelope } from '@wbfm/shared';

/** 客户端侧业务错误（携带后端错误码，供页面做差异化提示） */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Json = unknown;

/** Electron 托管模式下 preload 注入的一次性 token（浏览器/Node 单测环境为 undefined） */
export function getManagedToken(): string | undefined {
  const wbfm = (globalThis as { window?: { wbfm?: { token?: string } } }).window?.wbfm;
  return wbfm?.token || undefined;
}

/** 为 fetch 附加托管令牌（含 SSE 流式请求） */
export function withManagedHeaders(init: RequestInit = {}): RequestInit {
  const token = getManagedToken();
  if (!token) return init;
  const headers = new Headers(init.headers);
  if (!headers.has('x-wbfm-token')) headers.set('x-wbfm-token', token);
  return { ...init, headers };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(withManagedHeaders(init).headers);
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!isForm && init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiClientError('INTERNAL_ERROR', '服务响应解析失败', response.status);
  }

  if (!response.ok || !payload.success) {
    const body = payload as { success: false; error: { code: string; message: string; details?: unknown } };
    throw new ApiClientError(
      body.error?.code ?? 'INTERNAL_ERROR',
      body.error?.message ?? '请求失败',
      response.status,
      body.error?.details,
    );
  }
  return unwrapEnvelope(payload);
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Json,
): Promise<T> {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPost<T>(path: string, body?: Json): Promise<T> {
  return apiSend<T>('POST', path, body);
}

export function apiPatch<T>(path: string, body?: Json): Promise<T> {
  return apiSend<T>('PATCH', path, body);
}

export function apiPut<T>(path: string, body?: Json): Promise<T> {
  return apiSend<T>('PUT', path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

/** multipart 上传（文档摄入） */
export function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: form });
}
