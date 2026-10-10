import { describe, expect, it } from 'vitest';
import { extractKeyTerms, extractRuleSummary } from './rule-extractor';
import {
  extractRuleEntities,
  normalizeEntityName,
} from './entity-extractor';
import { hasDefinitionSignal, isTitleLike, splitSentences } from './text-units';

describe('splitSentences / isTitleLike', () => {
  it('按中英文句末标点切分并保留偏移', () => {
    const spans = splitSentences('苹果是红色的水果。香蕉是黄色的水果！');
    expect(spans.map((s) => s.text)).toEqual(['苹果是红色的水果。', '香蕉是黄色的水果！']);
    expect(spans[0]).toMatchObject({ start: 0, end: 9 });
  });

  it('换行作为弱断句；空白与空串安全', () => {
    expect(splitSentences('第一行\n第二行').map((s) => s.text)).toEqual(['第一行', '第二行']);
    expect(splitSentences('   ')).toEqual([]);
    expect(splitSentences('')).toEqual([]);
  });

  it('isTitleLike 识别章节序号短标题', () => {
    expect(isTitleLike('第3章 系统架构')).toBe(true);
    expect(isTitleLike('3.1 概述')).toBe(true);
    expect(isTitleLike('苹果是红色的水果。')).toBe(false);
  });

  it('hasDefinitionSignal 识别定义动词（中英）', () => {
    expect(hasDefinitionSignal('混合检索是指两路召回融合。')).toBe(true);
    expect(hasDefinitionSignal('The system consists of three layers.')).toBe(true);
    expect(hasDefinitionSignal('今天天气不错。')).toBe(false);
  });
});

describe('extractRuleSummary（无模型摘要）', () => {
  it('tldr 取首个实质句，跳过短标题；bullets 取原句且可回指', () => {
    const text = [
      '第1章 引言',
      '知识编译器是一种离线构建的静态知识层。它包括摘要、实体与关系三类产物，全部存于本机。',
      '普通段落没有特殊信号。',
    ].join('\n');
    const summary = extractRuleSummary(text);
    expect(summary.tldr).toContain('知识编译器是一种离线构建的静态知识层');
    // bullets 必须是原文句子（定义句 + 数字/包含信号得分最高）
    expect(summary.bullets.length).toBeGreaterThan(0);
    expect(summary.bullets.every((b) => text.includes(b.replace(/…$/, '')))).toBe(true);
    expect(summary.bullets.length).toBeLessThanOrEqual(3);
  });

  it('超长首句截断加省略号；空文本安全', () => {
    const long = `${'这是一句非常长的话'.repeat(20)}。`;
    const summary = extractRuleSummary(long);
    expect(summary.tldr.endsWith('…')).toBe(true);
    expect(summary.tldr.length).toBeLessThanOrEqual(121);
    expect(extractRuleSummary('').tldr).toBe('');
    expect(extractRuleSummary('').bullets).toEqual([]);
  });

  it('确定性：同输入两次输出完全一致', () => {
    const text = '模型 qwen2.5 是一个对话模型。qwen2.5 兼容 OpenAI 接口。';
    expect(extractRuleSummary(text)).toEqual(extractRuleSummary(text));
  });
});

describe('extractKeyTerms', () => {
  it('型号整词高权重命中；中文高频二字词入选', () => {
    const terms = extractKeyTerms(
      '混合检索结合向量检索，混合检索的结果更准。模型 qwen2.5 可用。',
    );
    expect(terms).toContain('qwen2.5');
    expect(terms).toContain('混合');
  });

  it('引号短语入选', () => {
    expect(extractKeyTerms('这是「静态知识层」的定义。')).toContain('静态知识层');
  });
});

describe('normalizeEntityName / extractRuleEntities', () => {
  it('归一化折叠空白/全半角/大小写/标点', () => {
    expect(normalizeEntityName('Work Buddy')).toBe('workbuddy');
    expect(normalizeEntityName('ＢＧＥ－Ｍ3')).toBe('bge-m3');
    expect(normalizeEntityName('知识 编译器')).toBe('知识编译器');
  });

  it('型号成为 product 实体并收集原文 mention（带偏移）', () => {
    const text = '对话可使用 qwen2.5 模型。qwen2.5 兼容 OpenAI 接口。';
    const entities = extractRuleEntities(text);
    const model = entities.find((e) => e.name.includes('qwen'));
    expect(model).toBeDefined();
    expect(model!.kind).toBe('product');
    expect(model!.mentions.length).toBeGreaterThanOrEqual(1);
    expect(model!.mentions[0]!.context).toContain('qwen2.5');
    // mention 偏移能在原文找回该句
    const m = model!.mentions[0]!;
    expect(text.slice(m.charStart, m.charEnd)).toBe(m.context);
  });

  it('括号中英别名归并为同一实体并互记 alias，括号内不产碎片实体', () => {
    const text = '可配置混合检索（Hybrid Retrieval）开关。';
    const entities = extractRuleEntities(text);
    const hit = entities.find(
      (e) => e.normalizedName === '可配置混合检索' || e.normalizedName === 'hybridretrieval',
    );
    expect(hit).toBeDefined();
    const names = [hit!.name, ...hit!.aliases].map(normalizeEntityName);
    expect(names).toEqual(expect.arrayContaining(['可配置混合检索', 'hybridretrieval']));
    // 括号内英文短语不得被型号模式拆成 Hybrid / Retrieval 噪声实体
    expect(entities.map((e) => e.normalizedName)).not.toContain('hybrid');
    expect(entities.map((e) => e.normalizedName)).not.toContain('retrieval');
  });

  it('每实体 mention 上限 5 条且按出现数排序', () => {
    const text = Array.from({ length: 8 }, (_, i) => `「重点概念」出现于第${i}句。`).join('');
    const entities = extractRuleEntities(text);
    const e = entities.find((x) => x.name === '重点概念');
    expect(e!.mentions.length).toBeLessThanOrEqual(5);
    expect(entities[0]!.mentions.length).toBeGreaterThanOrEqual(e!.mentions.length);
  });

  it('空文本安全', () => {
    expect(extractRuleEntities('')).toEqual([]);
  });
});
