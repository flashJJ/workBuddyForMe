import { describe, expect, it } from 'vitest';
import { ToolCallAccumulator } from './payloads';
import { normalizeOllamaBaseUrl, normalizeOllamaOrigin } from '../ollama/url';

describe('ToolCallAccumulator：工具调用增量归并', () => {
  it('按 index 拼装分片到达的 id/name/arguments', () => {
    const acc = new ToolCallAccumulator();
    acc.absorb([
      { index: 0, id: 'call-a', function: { name: 'current_time', arguments: '' } },
    ]);
    acc.absorb([{ index: 0, function: { arguments: '{"tim' } }]);
    acc.absorb([{ index: 0, function: { arguments: 'e":"now"}' } }]);
    acc.absorb([{ index: 1, id: 'call-b', function: { name: 'fetch_webpage', arguments: '{"u' } }]);
    acc.absorb([{ index: 1, function: { arguments: 'rl":"x"}' } }]);

    const calls = acc.assemble();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      id: 'call-a',
      type: 'function',
      function: { name: 'current_time', arguments: '{"time":"now"}' },
    });
    expect(calls[1]!.id).toBe('call-b');
    expect(calls[1]!.function.name).toBe('fetch_webpage');
    expect(calls[1]!.function.arguments).toBe('{"url":"x"}');
  });

  it('乱序到达时仍按 index 升序输出，缺 id 用兜底命名', () => {
    const acc = new ToolCallAccumulator();
    acc.absorb([{ index: 2, function: { name: 'x', arguments: '{}' } }]);
    acc.absorb([{ index: 0, function: { name: 'y', arguments: '{}' } }]);
    const calls = acc.assemble();
    expect(calls.map((c) => c.function.name)).toEqual(['y', 'x']);
    expect(calls[1]!.id).toBe('call_2');
  });

  it('无任何增量时 assemble 返回空数组', () => {
    expect(new ToolCallAccumulator().assemble()).toEqual([]);
  });
});

describe('Ollama 地址归一化', () => {
  it('裸地址补 /v1，已带 /v1 不重复补，去尾斜杠', () => {
    expect(normalizeOllamaBaseUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434/v1');
    expect(normalizeOllamaBaseUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434/v1');
    expect(normalizeOllamaBaseUrl('http://127.0.0.1:11434/v1/')).toBe('http://127.0.0.1:11434/v1');
  });

  it('原生端点使用服务根（去掉 /v1）', () => {
    expect(normalizeOllamaOrigin('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434');
    expect(normalizeOllamaOrigin('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
  });
});
