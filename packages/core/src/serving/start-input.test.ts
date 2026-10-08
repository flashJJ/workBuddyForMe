import { describe, expect, it } from 'vitest';
import type { FlowGraph, FlowInputField } from '@wbfm/shared/schemas';
import {
  StartInputValidationError,
  readFlowStartFields,
  validateFlowStartInput,
} from './start-input';

function graphWith(fields: FlowInputField[]): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: { inputs: fields } },
      { id: 'end', type: 'end', position: { x: 1, y: 1 }, config: {} },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
  };
}

describe('公开 invoke 入参校验（v0.9）', () => {
  const fields: FlowInputField[] = [
    { name: 'url', type: 'string', required: true },
    { name: 'topK', type: 'number', required: false, default: 3 },
    { name: 'full', type: 'boolean', required: false },
  ];

  it('从 start 节点读取字段声明', () => {
    expect(readFlowStartFields(graphWith(fields)).map((f) => f.name)).toEqual([
      'url',
      'topK',
      'full',
    ]);
    expect(readFlowStartFields(graphWith([]))).toEqual([]);
  });

  it('合法入参通过并补默认值；剥离未声明字段', () => {
    const input = validateFlowStartInput(fields, { url: 'https://x.test', extra: 1 });
    expect(input).toEqual({ url: 'https://x.test', topK: 3 });
  });

  it('缺必填 / 类型错误（含 null）抛字段级详情；多个问题一次性返回', () => {
    expect.assertions(4);
    try {
      validateFlowStartInput(fields, { topK: '5' });
    } catch (error) {
      expect(error).toBeInstanceOf(StartInputValidationError);
      const paths = (error as StartInputValidationError).details.map((d) => d.path);
      expect(paths).toContain('url');
      expect(paths).toContain('topK');
    }
    try {
      validateFlowStartInput(fields, { url: null });
    } catch (error) {
      expect((error as StartInputValidationError).details[0]?.path).toBe('url');
    }
  });

  it('空体/非对象体按缺参处理；可选字段可完全省略', () => {
    const urlField: FlowInputField = { name: 'url', type: 'string', required: true };
    const optional: FlowInputField[] = [
      { name: 'topK', type: 'number', required: false, default: 3 },
    ];
    expect(validateFlowStartInput(optional, undefined)).toEqual({ topK: 3 });
    expect(() => validateFlowStartInput([urlField], null)).toThrow(StartInputValidationError);
  });
});
