import { describe, expect, it } from 'vitest';
import type { Memory } from '@wbfm/shared/types';
import { formatMemoryBlock, buildRelationshipMemoryBlock } from './turn-memory';

function makeMemory(over: Partial<Memory>): Memory {
  return {
    id: '1',
    kind: 'event',
    content: '',
    importance: 0.5,
    status: 'active',
    sourceConversationId: null,
    sourceMessageId: null,
    recallCount: 0,
    lastAccessedAt: null,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
    ...over,
  };
}

describe('v2.0 M2 关系记忆软引用块', () => {
  it('空数组/无 relationship 类 → null（不注入）', () => {
    expect(buildRelationshipMemoryBlock([])).toBeNull();
    expect(
      buildRelationshipMemoryBlock([
        makeMemory({ kind: 'fact', content: '用户是后端工程师' }),
        makeMemory({ kind: 'preference', content: '偏好中文' }),
      ]),
    ).toBeNull();
  });

  it('只包含 relationship 类条目，且带软引用纪律文案（无把握不提/不罗列/不说根据记忆）', () => {
    const block = buildRelationshipMemoryBlock([
      makeMemory({ kind: 'fact', content: '不应出现的事实' }),
      makeMemory({ kind: 'relationship', content: '一起熬过三月上线' }),
    ])!;
    expect(block).toContain('【你和用户的共同经历】');
    expect(block).toContain('一起熬过三月上线');
    expect(block).not.toContain('不应出现的事实');
    expect(block).toContain('不确定相关性就完全不提');
    expect(block).toContain('不要逐条罗列');
    expect(block).toContain('不要说“根据记忆/记录”');
  });
});

describe('v2.0 M2 常规记忆块的 relationship 标签', () => {
  it('formatMemoryBlock 为 relationship 类打「共同经历」标签', () => {
    const block = formatMemoryBlock([
      makeMemory({ kind: 'relationship', content: '一起搬过家' }),
    ])!;
    expect(block).toContain('［共同经历］一起搬过家');
  });
});
