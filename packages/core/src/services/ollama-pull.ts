import { LOCAL_OLLAMA_URL } from './ollama-probe';

/** 单条拉取进度（Ollama /api/pull 的 NDJSON 行归一化） */
export interface OllamaPullProgress {
  /** 上游状态文案（pulling manifest / downloading …） */
  status: string;
  total: number | null;
  completed: number | null;
  /** 已下载百分比（0–100）；上游未给总量时为 null */
  percent: number | null;
}

export interface OllamaPullOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

function normalize(line: string): OllamaPullProgress | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: { status?: string; total?: number; completed?: number; error?: string };
  try {
    parsed = JSON.parse(trimmed) as typeof parsed;
  } catch {
    return null; // 忽略不可解析的行（半包/心跳）
  }
  if (parsed.error) throw new Error(parsed.error);
  const total = typeof parsed.total === 'number' ? parsed.total : null;
  const completed = typeof parsed.completed === 'number' ? parsed.completed : null;
  const percent =
    total && total > 0 && completed !== null
      ? Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
      : null;
  return { status: parsed.status ?? '', total, completed, percent };
}

/**
 * v2.4 P0-1（T4）：一键拉取本机 Ollama 模型——原生 `POST /api/pull` 的 NDJSON 流。
 * 只在用户显式点击时调用（不静默下载）；上游报错行抛错，客户端断开由 signal 传导中断。
 */
export async function* streamOllamaPull(
  modelId: string,
  options: OllamaPullOptions = {},
): AsyncGenerator<OllamaPullProgress> {
  const baseUrl = options.baseUrl ?? LOCAL_OLLAMA_URL;
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelId, stream: true }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Ollama 拉取接口返回 ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const progress = normalize(line);
      if (progress) yield progress;
    }
  }
  const tail = normalize(buffer);
  if (tail) yield tail;
}
