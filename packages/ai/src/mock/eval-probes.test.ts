import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { runEvalToolProbe, runReplayProbe } from './eval-probes';

function texts(chunks: ReturnType<typeof runReplayProbe>): string {
  return (chunks ?? []).map((chunk) => chunk.delta).join('');
}

describe('runReplayProbe（v4.18 M5 A/B 回放探针）', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: '【长期记忆】\n- 用户要求记住：我的项目代号是青鸟计划' },
    { role: 'user', content: '第一周目标：文档里标注版本号与变更日期' },
    { role: 'assistant', content: '收到。' },
    {
      role: 'user',
      content: '[eval-replay] memory=青鸟计划|10.0.8.21;citation=REPLAY-END;constraint=标注版本号',
    },
  ];

  it('system 分组只读系统消息，any 分组读系统与历史但排除探针自身', () => {
    const reply = texts(runReplayProbe(messages, messages[3]!.content as string));
    expect(reply).toContain('eval-replay');
    const payload = JSON.parse(reply.replace('eval-replay ', ''));
    // 青鸟计划在 system；10.0.8.21 只在探针自身，不能自证
    expect(payload.memory).toEqual([1, 0]);
    // 引用/约束只认 system
    expect(payload.citation).toEqual([0]);
    expect(payload.constraint).toEqual([0]);
  });

  it('system 中的引用标记会命中', () => {
    const withEvidence: ChatMessage[] = [
      {
        role: 'system',
        content: '【长期记忆】\n- 用户要求记住：我的项目代号是青鸟计划\n【参考资料】REPLAY-END',
      },
      ...messages.slice(1),
    ];
    const payload = JSON.parse(
      texts(runReplayProbe(withEvidence, messages[3]!.content as string)).replace('eval-replay ', ''),
    );
    expect(payload.citation).toEqual([1]);
  });

  it('未命中触发前缀返回 null', () => {
    expect(runReplayProbe(messages, '普通消息')).toBeNull();
  });
});

describe('runEvalToolProbe（v1.1 工具链路探针迁移）', () => {
  it('工具未授权时不接管', () => {
    expect(
      runEvalToolProbe({ messages: [], userText: '[eval-tool:foo]', hasTool: () => false }),
    ).toBeNull();
  });

  it('首轮发起调用，次轮引用 anchor 与 omitted', () => {
    const first = runEvalToolProbe({
      messages: [{ role: 'user', content: '[eval-tool:foo]' }],
      userText: '[eval-tool:foo]',
      hasTool: () => true,
    });
    expect(first?.[0]?.toolCalls?.[0]?.function.name).toBe('foo');

    const second = runEvalToolProbe({
      messages: [
        { role: 'user', content: '[eval-tool:foo]' },
        { role: 'tool', name: 'foo', content: '{"id":"anchor-1","__omitted":3}' },
      ],
      userText: '[eval-tool:foo]',
      hasTool: () => true,
    });
    expect(texts(second)).toContain('anchor=anchor-1');
    expect(texts(second)).toContain('omitted=3');
  });
});
