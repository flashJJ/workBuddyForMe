import { createProvider } from '@wbfm/ai';

/** 本机 Ollama 默认地址（与向导 Ollama 面板一致） */
export const LOCAL_OLLAMA_URL = 'http://127.0.0.1:11434';
/** 探活默认超时：向导进入即探测，不能让首启卡顿 */
export const OLLAMA_PROBE_TIMEOUT_MS = 1200;

/**
 * v2.4 M1：向导第 2 步「提前探测」本机 Ollama。
 * 复用正式 ollama 适配器的 testConnection（原生 /api/tags 探活），**不落库、无副作用**；
 * 未运行 / 超时 / 网络不可达一律返回 false，不抛错（探测失败不是错误状态）。
 */
export async function probeLocalOllama(
  baseUrl: string = LOCAL_OLLAMA_URL,
  timeoutMs: number = OLLAMA_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const adapter = createProvider({ protocol: 'ollama', baseUrl, apiKey: null });
    await adapter.testConnection(controller.signal);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
