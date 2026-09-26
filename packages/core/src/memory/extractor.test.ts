import { describe, expect, it, vi } from 'vitest';
import {
  buildExtractMessages,
  extractTurnMemories,
  parseExtractedMemories,
} from './extractor';
import type { ResolvedChatTarget } from '../chat/model-resolver';

function targetWithStream(chunks: string[]): ResolvedChatTarget {
  const chatStream = vi.fn(async function* () {
    for (const delta of chunks) yield { delta };
  });
  return {
    provider: { chatStream } as unknown as ResolvedChatTarget['provider'],
    model: { modelId: 'm1' } as ResolvedChatTarget['model'],
  };
}

describe('M3 记忆提取器', () => {
  it('请求消息：system 强约束 + 一轮对话，且限定 JSON 输出', () => {
    const messages = buildExtractMessages('我叫张三', '你好张三');
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toContain('fact');
    expect(messages[0]!.content).toContain('JSON');
    expect(messages[1]!.content).toContain('我叫张三');
    expect(messages[1]!.content).toContain('你好张三');
  });

  it('解析标准 JSON 数组', () => {
    const memories = parseExtractedMemories(
      JSON.stringify([
        { kind: 'fact', content: '用户在准备 PMP 考试', importance: 0.812 },
        { kind: 'preference', content: '偏好中文回复', importance: 1 },
      ]),
    );
    expect(memories).toEqual([
      { kind: 'fact', content: '用户在准备 PMP 考试', importance: 0.81 },
      { kind: 'preference', content: '偏好中文回复', importance: 1 },
    ]);
  });

  it('容忍代码围栏与解释性文字', () => {
    const raw = '好的，结果如下：\n```json\n[{"kind":"event","content":"下周搬家","importance":0.6}]\n```';
    expect(parseExtractedMemories(raw)).toEqual([
      { kind: 'event', content: '下周搬家', importance: 0.6 },
    ]);
  });

  it('空数组合法（本轮无值得记忆内容）', () => {
    expect(parseExtractedMemories('[]')).toEqual([]);
  });

  it('非法输入抛错：无数组、未知类别、importance 越界、内容过长', () => {
    expect(() => parseExtractedMemories('没有内容')).toThrow();
    expect(() => parseExtractedMemories('[{"kind":"x","content":"a","importance":0.5}]')).toThrow();
    expect(() => parseExtractedMemories('[{"kind":"fact","content":"a","importance":2}]')).toThrow();
    expect(() =>
      parseExtractedMemories(`[{"kind":"fact","content":"${'长'.repeat(501)}","importance":0.5}]`),
    ).toThrow();
  });

  it('超过 5 条拒绝（由上游静默）', () => {
    const items = Array.from({ length: 6 }, () => ({
      kind: 'fact' as const,
      content: '一条记忆',
      importance: 0.5,
    }));
    expect(() => parseExtractedMemories(JSON.stringify(items))).toThrow();
  });

  it('空对话直接返回空数组，不调用模型', async () => {
    const target = targetWithStream(['[]']);
    const memories = await extractTurnMemories({
      target,
      userContent: '   ',
      assistantContent: '回答',
    });
    expect(memories).toEqual([]);
    expect(target.provider.chatStream).not.toHaveBeenCalled();
  });

  it('流式拼接后解析，temperature 固定 0', async () => {
    const target = targetWithStream([
      '[{"kind":"fact",',
      '"content":"用户在北京工作","importance":0.7}]',
    ]);
    const memories = await extractTurnMemories({
      target,
      userContent: '我在北京做后端',
      assistantContent: '了解了',
    });
    expect(memories).toEqual([{ kind: 'fact', content: '用户在北京工作', importance: 0.7 }]);
    expect(target.provider.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0, model: 'm1' }),
    );
  });

  it('模型返回空串抛错', async () => {
    const target = targetWithStream(['  ']);
    await expect(
      extractTurnMemories({ target, userContent: '你好', assistantContent: '你好' }),
    ).rejects.toThrow(/为空/);
  });
});
