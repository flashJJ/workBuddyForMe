import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@wbfm/database';
import type { SecretCipher } from '../../secrets/cipher';
import type { ResolvedChatTarget } from './model-resolver';
import {
  buildVoicePolishMessages,
  polishVoiceText,
  polishWithTarget,
  sanitizePolishedText,
} from './voice-polish';

type ChatParamsLite = { temperature?: number; messages: unknown[] };

function targetWithStream(
  chunks: string[],
  onParams?: (params: ChatParamsLite) => void,
): ResolvedChatTarget {
  const chatStream = vi.fn(async function* (params: ChatParamsLite) {
    onParams?.(params);
    for (const delta of chunks) yield { delta };
  });
  return {
    provider: { chatStream } as unknown as ResolvedChatTarget['provider'],
    model: { modelId: 'm1' } as ResolvedChatTarget['model'],
  };
}

describe('v2.25 语音识别文本润色', () => {
  it('system 指令只允许纠错断句，不允许改语义', () => {
    const [system] = buildVoicePolishMessages('今天天气不错');
    expect(system!.role).toBe('system');
    expect(system!.content).toContain('不得增删信息');
    expect(system!.content).toContain('只输出整理后的纯文本');
  });

  it('清洗输出：去代码围栏与包裹引号；跑题（超 3 倍）放弃', () => {
    expect(sanitizePolishedText('你好', '```text\n你好。\n```')).toBe('你好。');
    expect(sanitizePolishedText('你好', '“你好。”')).toBe('你好。');
    expect(sanitizePolishedText('你好', '')).toBeNull();
    expect(sanitizePolishedText('你好', '这是一段非常长的解释'.repeat(5))).toBeNull();
  });

  it('润色成功：temperature 0，收集流式增量', async () => {
    let params: ChatParamsLite | undefined;
    const target = targetWithStream(['今天', '天气不错。'], (p) => {
      params = p;
    });
    const result = await polishWithTarget(target, '今天天气不错');
    expect(result).toBe('今天天气不错。');
    expect(params?.temperature).toBe(0);
    expect(params?.messages).toHaveLength(2);
  });

  it('无默认对话模型：静默回退原文', async () => {
    const db = createDatabase(':memory:');
    const cipher = {} as unknown as SecretCipher;
    const result = await polishVoiceText({ db, cipher, text: ' 你好 ' });
    expect(result).toEqual({ text: '你好', polished: false });
    db.close();
  });
});
