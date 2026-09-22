import { describe, expect, it, vi } from 'vitest';
import type { ChatChunk, ChatProvider } from '@wbfm/ai';
import { recognizePageWithVision } from './ocr-vision';
import type { ResolvedVisionTarget } from './vision-target';

function targetWithChunks(chunks: ChatChunk[]): ResolvedVisionTarget {
  async function* stream() {
    for (const chunk of chunks) yield chunk;
  }
  const provider = {
    supportsTools: false,
    testConnection: vi.fn(),
    listModels: vi.fn(),
    chatStream: stream,
    embed: vi.fn(),
  } as unknown as ChatProvider;
  return { provider, model: { modelId: 'qwen-vl' } as ResolvedVisionTarget['model'] };
}

describe('recognizePageWithVision', () => {
  it('拼接流式增量作为识别文本', async () => {
    const target = targetWithChunks([{ delta: '第一段' }, { delta: '第二段' }]);
    const text = await recognizePageWithVision(target, Buffer.from('png'));
    expect(text).toBe('第一段第二段');
  });

  it('剥离模型偶发包裹的 Markdown 代码块围栏', async () => {
    const target = targetWithChunks([{ delta: '```text\n扫描文字内容\n```' }]);
    expect(await recognizePageWithVision(target, Buffer.from('png'))).toBe('扫描文字内容');
  });

  it('透传 AbortSignal 给供应商调用', async () => {
    const chatStream = vi.fn();
    const provider = { chatStream } as unknown as ChatProvider;
    const signal = AbortSignal.timeout(10_000);
    await recognizePageWithVision(
      { provider, model: { modelId: 'm' } as ResolvedVisionTarget['model'] },
      Buffer.from('png'),
      signal,
    ).catch(() => undefined);
    expect(chatStream).toHaveBeenCalledWith(expect.objectContaining({ signal }));
  });
});
