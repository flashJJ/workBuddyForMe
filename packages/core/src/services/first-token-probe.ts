import type { DatabaseInstance, ProviderRecord } from '@wbfm/database';
import type { SecretCipher } from '../secrets/cipher';
import { buildProvider } from './provider-adapter';

/** 固定极短探针 prompt（常量，不含任何用户数据） */
export const FIRST_TOKEN_PROBE_PROMPT = '你好';
/** 自检硬超时：超过即判定「建议换来源」（M0 §6 冻结分档上限） */
export const FIRST_TOKEN_PROBE_TIMEOUT_MS = 8000;

export interface FirstTokenProbeOutcome {
  /** 是否在超时内取到首个 token */
  ok: boolean;
  /** 首 token 延迟（毫秒）；未取到为 null */
  firstTokenMs: number | null;
  /** 本轮总耗时（毫秒）；未完成为 null */
  totalMs: number | null;
}

/**
 * v2.4 M1 T5：对指定供应商/模型跑一次固定极短 prompt 的流式自检。
 * 只测用户已选定的来源（不触达其他厂商）；prompt 为常量、不含用户数据。
 */
export async function probeFirstToken(
  db: DatabaseInstance,
  cipher: SecretCipher,
  provider: ProviderRecord,
  modelId: string,
  timeoutMs: number = FIRST_TOKEN_PROBE_TIMEOUT_MS,
): Promise<FirstTokenProbeOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  let firstTokenMs: number | null = null;
  try {
    const adapter = buildProvider(db, cipher, provider);
    for await (const chunk of adapter.chatStream({
      model: modelId,
      messages: [{ role: 'user', content: FIRST_TOKEN_PROBE_PROMPT }],
      maxTokens: 32,
      signal: controller.signal,
    })) {
      if (firstTokenMs === null && chunk.delta) firstTokenMs = Date.now() - startedAt;
    }
    return { ok: firstTokenMs !== null, firstTokenMs, totalMs: Date.now() - startedAt };
  } catch {
    // 超时（abort）或上游报错：按未取到首字处理，由调用方给「建议换来源」
    return { ok: false, firstTokenMs, totalMs: null };
  } finally {
    clearTimeout(timer);
  }
}
