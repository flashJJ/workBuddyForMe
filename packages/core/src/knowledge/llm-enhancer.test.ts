import { describe, expect, it } from 'vitest';
import { validateLlmSeed } from './llm-enhancer';
import type { CompiledSeed } from './knowledge-compiler';

const TEXT = 'Qwen2.5 是一个对话模型。Qwen2.5 兼容 OpenAI 接口。模型支持流式输出。';

const fallback: CompiledSeed = {
  tldr: '规则摘要原句。',
  bullets: ['规则要点原句。'],
  keyTerms: ['规则词'],
  extractor: 'rule',
  modelId: null,
  entities: [],
};

describe('validateLlmSeed（LLM 增强产物校验）', () => {
  it('合法产物：逐字原句采纳、extractor/modelId 翻转、keyTerms 沿用规则', () => {
    const seed = validateLlmSeed(
      {
        tldr: 'Qwen2.5 是一个对话模型。',
        bullets: ['Qwen2.5 兼容 OpenAI 接口。'],
        entities: [
          {
            name: 'Qwen2.5',
            kind: 'product',
            aliases: ['OpenAI'],
            context: ['Qwen2.5 兼容 OpenAI 接口。'],
          },
        ],
      },
      TEXT,
      fallback,
      'chat-model-1',
    );
    expect(seed).not.toBeNull();
    expect(seed!.extractor).toBe('llm');
    expect(seed!.modelId).toBe('chat-model-1');
    expect(seed!.tldr).toBe('Qwen2.5 是一个对话模型。');
    expect(seed!.keyTerms).toEqual(['规则词']);
    expect(seed!.entities[0]).toMatchObject({ name: 'Qwen2.5', kind: 'product' });
    expect(seed!.entities[0]!.aliases).toContain('OpenAI');
  });

  it('幻觉防护：非原句的 tldr/bullet/context 全部丢弃', () => {
    const seed = validateLlmSeed(
      {
        tldr: '模型凭空生成的一句话。',
        bullets: ['Qwen2.5 兼容 OpenAI 接口。', '同样是编造的要点。'],
        entities: [
          { name: '不存在的型号', kind: 'product', context: ['型号支持流式输出。'] },
          { name: 'Qwen2.5', kind: 'product', context: ['模型凭空生成的实体说明。'] },
        ],
      },
      TEXT,
      fallback,
      'm1',
    );
    expect(seed).not.toBeNull();
    expect(seed!.tldr).toBe('规则摘要原句。');
    expect(seed!.bullets).toEqual(['Qwen2.5 兼容 OpenAI 接口。']);
    // 名称非原文的实体整体丢弃；context 全假的实体也丢弃
    expect(seed!.entities).toEqual([]);
  });

  it('非原文别名丢弃；非法 kind 归 concept；同归一化名实体合并', () => {
    const seed = validateLlmSeed(
      {
        entities: [
          { name: 'Qwen2.5', kind: 'weird', aliases: ['瞎编别名'], context: ['Qwen2.5 是一个对话模型。'] },
          { name: 'Qwen2.5', kind: 'product', aliases: [], context: ['Qwen2.5 兼容 OpenAI 接口。'] },
        ],
      },
      TEXT,
      fallback,
      'm1',
    );
    expect(seed!.entities).toHaveLength(1);
    expect(seed!.entities[0]!.kind).toBe('concept');
    expect(seed!.entities[0]!.aliases).not.toContain('瞎编别名');
    expect(seed!.entities[0]!.contexts).toHaveLength(2);
  });

  it('零有效增强（全回退且无实体）返回 null，整体走规则通道', () => {
    expect(validateLlmSeed(null, TEXT, fallback, 'm1')).toBeNull();
    expect(validateLlmSeed('junk', TEXT, fallback, 'm1')).toBeNull();
    expect(
      validateLlmSeed(
        { tldr: '编造。', bullets: ['编造。'], entities: [] },
        TEXT,
        fallback,
        'm1',
      ),
    ).toBeNull();
  });

  it('bullets 上限 3、entities 上限 15', () => {
    const seed = validateLlmSeed(
      {
        bullets: [
          'Qwen2.5 是一个对话模型。',
          'Qwen2.5 兼容 OpenAI 接口。',
          '模型支持流式输出。',
          'Qwen2.5 是一个对话模型。',
        ],
        entities: Array.from({ length: 20 }, (_, i) => ({
          name: i === 0 ? 'Qwen2.5' : `不存在的名字${i}`,
          kind: 'concept',
          context: i === 0 ? ['Qwen2.5 兼容 OpenAI 接口。'] : ['编造上下文。'],
        })),
      },
      TEXT,
      fallback,
      'm1',
    );
    expect(seed!.bullets).toHaveLength(3);
    expect(seed!.entities).toHaveLength(1);
  });
});
