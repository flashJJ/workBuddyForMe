import type { ResolvedChatTarget } from '../chat/model-resolver';

export interface CompleteTextParams {
  system: string;
  user: string;
  signal?: AbortSignal;
}

/**
 * v2.6 会议结论/分段压缩用的一次性文本补全：
 * 复用 ChatProvider.chatStream（无 tools），收集全部 delta 后返回全文。
 * 结论调用温度低于发言，减少发散；失败由 provider 抛 ProviderError。
 */
export async function completeMeetingText(
  target: ResolvedChatTarget,
  params: CompleteTextParams,
): Promise<string> {
  let content = '';
  const stream = target.provider.chatStream({
    model: target.model.modelId,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
    temperature: 0.2,
    ...(params.signal ? { signal: params.signal } : {}),
  });
  for await (const chunk of stream) {
    if (chunk.delta) content += chunk.delta;
  }
  return content;
}
