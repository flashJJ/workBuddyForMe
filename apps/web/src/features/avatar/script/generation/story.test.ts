import { describe, expect, it } from 'vitest';
import type { PetScriptStoryMeta } from '@wbfm/shared/schemas';
import {
  emptyStoryState,
  findDuplicate,
  ingestStory,
  normalizeTheme,
  resolveStoryState,
  storyContextForPrompt,
  storySummary,
} from './story';

function meta(patch: Partial<PetScriptStoryMeta> = {}): PetScriptStoryMeta {
  return {
    title: '茶凉了',
    theme: '喝茶等待',
    tags: ['茶', '等待'],
    ...patch,
  };
}

describe('剧情状态机（P8.4）', () => {
  it('新场景开线并留下悬念', () => {
    const state = ingestStory(emptyStoryState(), 'gen.a', meta({ cliffhanger: '茶凉了' }), 1000);
    expect(state.threads).toHaveLength(1);
    expect(state.threads[0]).toMatchObject({ status: 'open', cliffhanger: '茶凉了' });
    expect(state.cliffhanger).toEqual({ text: '茶凉了', sceneId: 'gen.a', at: 1000 });
    expect(storySummary(state)).toMatchObject({ openThreads: 1, cliffhanger: '茶凉了' });
    expect(storyContextForPrompt(state)).toContain('茶凉了');
  });

  it('resolves 收掉匹配的悬念与线索', () => {
    const opened = ingestStory(emptyStoryState(), 'gen.a', meta({ cliffhanger: '茶凉了' }), 1000);
    const closed = ingestStory(
      opened,
      'gen.b',
      meta({ title: '把茶喝了', theme: '喝茶收尾', tags: ['茶', '收尾'], resolves: '茶凉了' }),
      2000,
    );
    expect(closed.cliffhanger).toBeNull();
    expect(closed.threads[0]).toMatchObject({ status: 'closed', cliffhanger: null });
    expect(closed.threads[0]?.sceneIds).toEqual(['gen.a', 'gen.b']);
    expect(storySummary(closed).openThreads).toBe(0);
  });

  it('去重：同主题或共享 2 个梗标签', () => {
    const state = ingestStory(emptyStoryState(), 'gen.a', meta(), 1000);
    expect(findDuplicate(state, 'gen.b', meta({ theme: '喝茶等待！' }))).toContain('主题');
    expect(
      findDuplicate(state, 'gen.c', meta({ title: '别的', theme: '新主题', tags: ['茶', '等待', 'x'] })),
    ).toContain('梗标签');
    expect(
      findDuplicate(state, 'gen.d', meta({ title: '别的', theme: '新主题', tags: ['书'] })),
    ).toBeNull();
    expect(findDuplicate(state, 'gen.a', meta({ theme: '新主题', tags: ['书'] }))).toContain('id');
  });

  it('主题归一化忽略空白/标点/大小写', () => {
    expect(normalizeTheme('  Tea-Time！')).toBe(normalizeTheme('teatime'));
  });

  it('坏数据回落安全状态；上下文包含近期主题与已用梗', () => {
    expect(resolveStoryState({ threads: 'x', recent: [{ sceneId: 'gen.a', theme: '茶' }] })).toMatchObject({
      threads: [],
      recent: [{ sceneId: 'gen.a', theme: '茶' }],
    });

    const state = ingestStory(emptyStoryState(), 'gen.a', meta({ cliffhanger: '茶凉了' }), 1000);
    const context = storyContextForPrompt(state);
    expect(context).toContain('未收悬念');
    expect(context).toContain('最近主题');
    expect(context).toContain('已用梗标签');
  });
});
