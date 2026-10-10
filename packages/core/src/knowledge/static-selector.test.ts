import { describe, expect, it } from 'vitest';
import {
  analyzeQuery,
  isEntityMentioned,
  selectStaticKnowledge,
  type SelectorEntity,
  type SelectorSummary,
} from './static-selector';

function entity(over: Partial<SelectorEntity>): SelectorEntity {
  return {
    name: '未命名',
    normalizedName: 'weimingming',
    aliases: [],
    kind: 'concept',
    mentionCount: 1,
    mentions: [
      {
        context: '默认原句。',
        documentId: 'd1',
        documentName: 'd1.txt',
        chunkId: 1,
        pageNo: 1,
        paragraphNo: 1,
      },
    ],
    ...over,
  };
}

const summary: SelectorSummary = {
  documentId: 'd1',
  documentName: 'd1.txt',
  tldr: '混合检索融合两路召回。',
  bullets: ['要点一。'],
  keyTerms: ['混合检索'],
};

describe('analyzeQuery', () => {
  it('抽取关键词并补标点切词；归一化词表', () => {
    const s = analyzeQuery('qwen2.5 支持哪些接口？');
    expect(s.terms).toContain('qwen2.5');
    // 归一化折叠句点，与实体归一键同一套规则
    expect(s.normalizedTerms).toContain('qwen25');
    expect(s.normalizedQuery).toContain('qwen25');
  });
});

describe('isEntityMentioned 精确复核', () => {
  it('全名/别名逐字出现在查询中才算命中', () => {
    const e = entity({ name: '混合检索', normalizedName: '混合检索', aliases: ['Hybrid Retrieval'] });
    expect(isEntityMentioned(e, analyzeQuery('什么是混合检索？'))).toBe(true);
    expect(isEntityMentioned(e, analyzeQuery('Hybrid Retrieval 怎么开？'))).toBe(true);
    // LIKE 召回的假阳性（查询根本不含该名）被复核拒绝
    expect(isEntityMentioned(e, analyzeQuery('今天天气如何'))).toBe(false);
  });

  it('拉丁短于 3 字符的面不参与匹配', () => {
    const e = entity({ name: 'AI', normalizedName: 'ai', aliases: [] });
    expect(isEntityMentioned(e, analyzeQuery('AI 是什么'))).toBe(false);
  });
});

describe('selectStaticKnowledge', () => {
  it('命中实体：取包含实体名的最短原句，带出处坐标', () => {
    const e = entity({
      name: 'Qwen2.5',
      normalizedName: 'qwen2.5',
      mentionCount: 3,
      mentions: [
        { context: '这是一句完全无关的超长铺陈句。', documentId: 'd1', documentName: 'd1.txt', chunkId: 1, pageNo: 1, paragraphNo: 1 },
        { context: 'Qwen2.5 兼容 OpenAI 接口。', documentId: 'd2', documentName: 'd2.txt', chunkId: 9, pageNo: 3, paragraphNo: 4 },
      ],
    });
    const facts = selectStaticKnowledge(analyzeQuery('Qwen2.5 兼容什么？'), [e], []);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.kind).toBe('entity');
    expect(facts[0]!.text).toBe('Qwen2.5 兼容 OpenAI 接口。');
    expect(facts[0]!).toMatchObject({ documentId: 'd2', pageNo: 3, paragraphNo: 4, chunkId: 9 });
  });

  it('硬上限：默认最多 2 实体 + 1 摘要', () => {
    const entities = [1, 2, 3, 4].map((n) =>
      entity({
        name: `实体${n}`,
        normalizedName: `实体${n}`,
        mentions: [
          { context: `实体${n} 的说明。`, documentId: `d${n}`, documentName: `${n}.txt`, chunkId: n, pageNo: null, paragraphNo: null },
        ],
      }),
    );
    const relevantSummary: SelectorSummary = {
      ...summary,
      tldr: '实体体系总览。',
      keyTerms: ['实体'],
    };
    const facts = selectStaticKnowledge(
      analyzeQuery('实体1 实体2 实体3 实体4 分别是什么'),
      entities,
      [relevantSummary, { ...relevantSummary, documentId: 'd9' }],
    );
    expect(facts.filter((f) => f.kind === 'entity')).toHaveLength(2);
    expect(facts.filter((f) => f.kind === 'summary')).toHaveLength(1);
  });

  it('同文档同原句的实体不重复占位', () => {
    const mk = (name: string) =>
      entity({
        name,
        normalizedName: name,
        mentions: [
          { context: '混合检索与重排配合使用。', documentId: 'd1', documentName: 'd1.txt', chunkId: 1, pageNo: null, paragraphNo: null },
        ],
      });
    const facts = selectStaticKnowledge(analyzeQuery('混合检索 重排'), [
      mk('混合检索'),
      mk('重排'),
    ]);
    expect(facts).toHaveLength(1);
  });

  it('零命中返回空数组（调用方零差异回落 chunk 链路）', () => {
    const facts = selectStaticKnowledge(
      analyzeQuery(' unrelated question '),
      [entity({ name: '混合检索', normalizedName: '混合检索' })],
      [summary],
    );
    expect(facts).toEqual([]);
  });

  it('摘要事实文本=tldr+首个要点，且不含生成句', () => {
    const facts = selectStaticKnowledge(analyzeQuery('混合检索的要点'), [], [summary]);
    expect(facts[0]!.kind).toBe('summary');
    expect(facts[0]!.text).toContain('混合检索融合两路召回。');
    expect(facts[0]!.text).toContain('要点一。');
  });
});
