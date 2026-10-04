import { describe, expect, it } from 'vitest';
import { extractReferences, resolveFlowRefs, RefResolutionError } from './refs';
import type { FlowScope } from './types';

function scopeOf(entries: Record<string, Record<string, unknown>>): FlowScope {
  return new Map(Object.entries(entries));
}

describe('resolveFlowRefs：字符串插值', () => {
  it('整串单个引用保留原始类型（数字/对象/布尔）', () => {
    const scope = scopeOf({ search: { outputs: { count: 3, meta: { k: 'v' }, ok: true } } });
    expect(resolveFlowRefs('{{$nodes.search.outputs.count}}', scope)).toBe(3);
    expect(resolveFlowRefs('{{$nodes.search.outputs.meta}}', scope)).toEqual({ k: 'v' });
    expect(resolveFlowRefs('{{$nodes.search.outputs.ok}}', scope)).toBe(true);
  });

  it('模板内混合文本按字符串拼接', () => {
    const scope = scopeOf({ start: { params: { topic: '周报' } } });
    expect(resolveFlowRefs('请整理：{{$nodes.start.params.topic}}，谢谢', scope)).toBe('请整理：周报，谢谢');
  });

  it('支持 start.params 与节点 outputs 两种作用域段', () => {
    const scope = scopeOf({
      start: { params: { n: 1 } },
      gen: { outputs: { text: 'done' } },
    });
    expect(resolveFlowRefs('{{$nodes.start.params.n}}', scope)).toBe(1);
    expect(resolveFlowRefs('{{$nodes.gen.outputs.text}}', scope)).toBe('done');
  });
});

describe('resolveFlowRefs：整字段绑定与递归', () => {
  it('$ref 整体替换保持对象类型', () => {
    const scope = scopeOf({ search: { outputs: { chunks: [{ c: 1 }] } } });
    const config = { query: { $ref: 'nodes.search.outputs.chunks' }, keep: true };
    expect(resolveFlowRefs(config, scope)).toEqual({ query: [{ c: 1 }], keep: true });
  });

  it('数组与嵌套对象递归解析', () => {
    const scope = scopeOf({ a: { outputs: { x: 'X' } }, b: { outputs: { y: 'Y' } } });
    const value = { list: ['{{$nodes.a.outputs.x}}', { deep: '{{$nodes.b.outputs.y}}' }], n: 1 };
    expect(resolveFlowRefs(value, scope)).toEqual({ list: ['X', { deep: 'Y' }], n: 1 });
  });

  it('原始类型（number/boolean/null）原样返回', () => {
    const scope = scopeOf({});
    expect(resolveFlowRefs(42, scope)).toBe(42);
    expect(resolveFlowRefs(true, scope)).toBe(true);
    expect(resolveFlowRefs(null, scope)).toBeNull();
  });
});

describe('resolveFlowRefs：错误', () => {
  it('引用不存在的节点抛 RefResolutionError', () => {
    const scope = scopeOf({});
    expect(() => resolveFlowRefs('{{$nodes.ghost.outputs.x}}', scope)).toThrow(RefResolutionError);
  });

  it('引用节点上不存在的字段抛错', () => {
    const scope = scopeOf({ gen: { outputs: { text: 'x' } } });
    expect(() => resolveFlowRefs('{{$nodes.gen.outputs.missing}}', scope)).toThrow(/不存在/);
  });

  it('非法作用域段（非 outputs/params）抛错', () => {
    const scope = scopeOf({ gen: { outputs: {} } });
    expect(() => resolveFlowRefs('{{$nodes.gen.inputs.x}}', scope)).toThrow(/outputs 或 params/);
  });

  it('$ref 路径格式非法抛错', () => {
    const scope = scopeOf({});
    expect(() => resolveFlowRefs({ $ref: 'gen.outputs.x' }, scope)).toThrow(RefResolutionError);
  });
});

describe('extractReferences', () => {
  it('收集模板与 $ref 中的全部裸路径', () => {
    const value = {
      prompt: '{{$nodes.start.params.topic}} + {{$nodes.search.outputs.context}}',
      payload: { $ref: 'nodes.gen.outputs.obj' },
    };
    expect(extractReferences(value).sort()).toEqual(
      [
        'nodes.start.params.topic',
        'nodes.search.outputs.context',
        'nodes.gen.outputs.obj',
      ].sort(),
    );
  });
});
