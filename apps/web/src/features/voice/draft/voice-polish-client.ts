import { apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import type { VoicePolishResponse } from '@wbfm/shared/schemas';

/** v2.25：请求模型润色；任何失败返回 null（调用方保留识别原文） */
export async function requestVoicePolish(text: string): Promise<string | null> {
  try {
    const result = await apiPost<VoicePolishResponse>(API.voicePolish, { text });
    return result.polished ? result.text : null;
  } catch {
    return null;
  }
}
