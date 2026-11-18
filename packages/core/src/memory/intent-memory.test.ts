import { describe, expect, it, vi } from 'vitest';
import type { MemoryService } from './memory-service';
import { applyMemoryIntent } from './intent-memory';

function fakeMemory(over: Partial<Record<'rememberOne' | 'recall' | 'update', unknown>> = {}) {
  const rememberOne = vi.fn(async (input: { content: string }) => ({
    id: 'm1',
    content: input.content,
  }));
  const recall = vi.fn(async () => []);
  const update = vi.fn(async () => null);
  const memory = {
    rememberOne: over.rememberOne ?? rememberOne,
    recall: over.recall ?? recall,
    update: over.update ?? update,
  } as unknown as MemoryService;
  return { memory, rememberOne, recall, update };
}

const base = {
  assistantId: 'a1',
  conversationId: 'c1',
  sourceMessageId: 'msg1',
};

describe('applyMemoryIntent（v4.8 记住/忘掉）', () => {
  it('记住命令写入助手作用域事实并返回内联提示', async () => {
    const { memory, rememberOne } = fakeMemory();
    const notices = await applyMemoryIntent({ ...base, memory, text: '记住我喜欢冰美式' });
    expect(notices).toEqual([{ id: 'm1', content: '我喜欢冰美式' }]);
    expect(rememberOne).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'fact', source: 'manual', scope: 'assistant' }),
      undefined,
    );
  });

  it('忘掉命令只归档高相关记忆，低分不动作', async () => {
    const recall = vi.fn(async () => [
      { id: 'm2', score: 0.8, content: '喜欢冰美式' },
      { id: 'm3', score: 0.3, content: '无关记忆' },
    ]);
    const update = vi.fn(async () => null);
    const { memory } = fakeMemory({ recall, update });
    const notices = await applyMemoryIntent({ ...base, memory, text: '忘掉我喜欢冰美式' });
    expect(notices).toEqual([]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('m2', { status: 'archived' }, undefined);
  });

  it('非记忆命令不调用记忆服务', async () => {
    const { memory, rememberOne, recall } = fakeMemory();
    const notices = await applyMemoryIntent({ ...base, memory, text: '今天天气不错' });
    expect(notices).toEqual([]);
    expect(rememberOne).not.toHaveBeenCalled();
    expect(recall).not.toHaveBeenCalled();
  });

  it('写入失败静默返回空提示', async () => {
    const rememberOne = vi.fn(async () => {
      throw new Error('db busy');
    });
    const { memory } = fakeMemory({ rememberOne });
    await expect(
      applyMemoryIntent({ ...base, memory, text: '记住我不吃香菜' }),
    ).resolves.toEqual([]);
  });
});
