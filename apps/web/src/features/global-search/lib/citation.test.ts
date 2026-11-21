import { describe, expect, it } from 'vitest';
import { CITATION_MAX_LENGTH, buildHitCitation } from './citation';

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
