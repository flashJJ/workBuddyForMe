import { describe, expect, it } from 'vitest';
import { inferModelCapabilities } from './model-capabilities';

describe('inferModelCapabilities 模型 ID 能力推断', () => {
  it('嵌入模型系列识别为 embedding-only', () => {
    const cases = [
      'qwen3-embedding:0.6b',
      'qwen3-embedding:4b',
      'nomic-embed-text',
      'bge-m3',
      'bge-large-zh-v1.5',
      'bge-small-en',
      'gte-large',
      'gte-qwen2',
      'm3e-base',
      'jina-embeddings-v3',
      'snowflake-arctic-embed:2.0',
      'all-minilm',
    ];
    for (const id of cases) {
      expect(inferModelCapabilities(id), id).toEqual(['embedding']);
    }
  });

  it('视觉模型识别为 chat+vision', () => {
    const cases = [
      'qwen2.5-vl:7b',
      'qwen2-vl:2b',
      'qwen2.5vl:7b',
      'minicpm-v:8b',
      'llava:7b',
      'internvl2:8b',
      'gpt-4o', // 名字无 vision 关键词，归 chat（vision 能力由用户手勾）
    ];
    const expected: Record<string, string[]> = {
      'gpt-4o': ['chat'],
    };
    for (const id of cases) {
      expect(inferModelCapabilities(id), id).toEqual(expected[id] ?? ['chat', 'vision']);
    }
  });

  it('普通对话模型默认 chat', () => {
    for (const id of [
      'qwen2.5:7b',
      'gpt-4o-mini',
      'deepseek-chat',
      'llama3.1:8b',
      'moonshot-v1-32k',
    ]) {
      expect(inferModelCapabilities(id), id).toEqual(['chat']);
    }
  });

  it('大小写与首尾空格不影响识别', () => {
    expect(inferModelCapabilities('  Qwen3-Embedding:0.6B ')).toEqual(['embedding']);
    expect(inferModelCapabilities('BGE-M3')).toEqual(['embedding']);
  });
});
