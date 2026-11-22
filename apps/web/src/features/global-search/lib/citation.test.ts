import { describe, expect, it } from 'vitest';
import {
  CITATION_MAX_LENGTH,
  TASK_DRAFT_MAX_LENGTH,
  buildHitCitation,
  buildHitTaskDraft,
  buildHitTaskHref,
} from './citation';

describe('v4.19 知识结果复制引用', () => {
  it('只拼接标题与深链，不含片段或正文', () => {
    const citation = buildHitCitation({
      title: '青鸟计划.md',
      deepLink: '/knowledge?kb=kb1',
    });
    expect(citation).toBe('青鸟计划.md — /knowledge?kb=kb1');
  });

  it('超长标题截断到 300 字符以内', () => {
    const citation = buildHitCitation({
      title: '长'.repeat(400),
      deepLink: '/knowledge?kb=kb1',
    });
    expect(citation.length).toBe(CITATION_MAX_LENGTH);
  });
});

describe('v4.20 知识「以引用新建任务」', () => {
  it('草稿只含标题与深链，不含片段或正文', () => {
    const draft = buildHitTaskDraft({
      title: '青鸟计划.md',
      deepLink: '/knowledge?kb=kb1&doc=d1',
    });
    expect(draft).toBe('请基于文档《青鸟计划.md》继续处理：/knowledge?kb=kb1&doc=d1');
  });

  it('草稿截断到 500 字符，深链按 encodeURIComponent 编码', () => {
    const draft = buildHitTaskDraft({
      title: '长'.repeat(600),
      deepLink: '/knowledge?kb=kb1',
    });
    expect(draft.length).toBe(TASK_DRAFT_MAX_LENGTH);
    const href = buildHitTaskHref({ title: '青鸟计划.md', deepLink: '/knowledge?kb=kb1' });
    expect(href.startsWith('/tasks?draft=')).toBe(true);
    expect(href).not.toContain('/knowledge?kb=kb1');
    expect(new URL(href, 'http://localhost').searchParams.get('draft')).toBe(
      '请基于文档《青鸟计划.md》继续处理：/knowledge?kb=kb1',
    );
  });
});
