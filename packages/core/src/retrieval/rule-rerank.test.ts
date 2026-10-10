import { describe, expect, it } from 'vitest';
import { ruleRerank, type RerankCandidate } from './rule-rerank';
import { reciprocalRankFusion } from './hybrid-fusion';

function candidate(
  chunkId: number,
  content: string,
  documentName: string,
  channels: Array<'vec' | 'fts'> = ['vec'],
  rrf?: number,
): RerankCandidate {
  return {
    chunkId,
    content,
    documentName,
    channels,
    rrf:
      rrf ??
      reciprocalRankFusion([{ channel: channels[0]!, hits: [chunkId] }])[0]!.rrf,
  };
}

describe('ruleRerank（无模型规则重排）', () => {
  it('查询无有效词时退化为按 rrf 基础分排序（不报错）', () => {
    const a = candidate(1, '苹果内容', '水果');
    const b = candidate(2, '香蕉内容', '水果');
    const out = ruleRerank([b, a], '///');
    // 两者 rrf 相同 → chunkId 升序
    expect(out.map((s) => s.chunkId)).toEqual([1, 2]);
  });

  it('精确词覆盖率高的正文排在前面（纯向量只按距离时未必）', () => {
    // 1 号与查询词面完全无关；2 号含「混合检索」全部词面
    const irrelevant = candidate(1, '今天天气晴朗适合出门散步', '杂记');
    const precise = candidate(2, '本章讲解混合检索与重排的实现', '检索设计', ['vec']);
    const out = ruleRerank([irrelevant, precise], '混合检索');
    expect(out[0]!.chunkId).toBe(2);
    expect(out[0]!.matchedTerms).toEqual(expect.arrayContaining(['混', '合', '检', '索']));
  });

  it('双通道命中比单通道获额外加权', () => {
    const single = candidate(1, '混合检索混合检索混合检索', '文档', ['vec']);
    const both = candidate(2, '混合检索', '文档', ['vec', 'fts']);
    const out = ruleRerank([single, both], '混合检索');
    // 即使单通道正文词覆盖相同，双通道加权 + 短语命中应让 2 号不低于 1 号
    expect(out[0]!.chunkId).toBe(2);
  });

  it('文档名命中查询词获得加权', () => {
    const a = candidate(1, '一段普通的说明文字', '其它资料');
    const b = candidate(2, '一段普通的说明文字', '混合检索手册');
    // 正文相同、其它信号一致时，文档名命中者在前
    const out = ruleRerank([a, b], '混合检索');
    expect(out[0]!.chunkId).toBe(2);
  });

  it('连续短语命中获得加权（原始查询整串出现）', () => {
    const phrase = candidate(1, '这里出现了混合检索四个字连续', 'd', ['vec']);
    const scattered = candidate(2, '混在一起合体检索分散', 'd', ['vec']);
    const out = ruleRerank([scattered, phrase], '混合检索');
    expect(out[0]!.chunkId).toBe(1);
  });

  it('输出确定性：同分按 chunkId 升序，且分数为有限数', () => {
    const out = ruleRerank(
      [candidate(30, 'a', 'd'), candidate(10, 'a', 'd'), candidate(20, 'a', 'd')],
      '',
    );
    expect(out.map((s) => s.chunkId)).toEqual([10, 20, 30]);
    expect(out.every((s) => Number.isFinite(s.score))).toBe(true);
  });
});
