import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './types';
import {
  createScenarioRuntime,
  scenarioRound,
  toolStateProbe,
  type MockScenarioFile,
} from './mock-scenario';

const FILE: MockScenarioFile = {
  scenarios: {
    fetch: {
      turns: [
        {
          toolCalls: [
            { name: 'fetch_webpage', args: { url: 'http://fixture.local/a' } },
            { name: 'fetch_webpage', args: { url: 'http://fixture.local/b' } },
          ],
        },
        { content: '完成 {{toolState}}' },
      ],
    },
    overflow: {
      turns: [{ error: { type: 'context_overflow' }, content: '溢出后恢复' }],
    },
  },
};

const PARAMS = {
  model: 'mock-chat',
  messages: [
    { role: 'system', content: '系统' },
    { role: 'user', content: '[scenario:fetch] 抓取' },
  ] as ChatMessage[],
  tools: [{ type: 'function' as const, function: { name: 'fetch_webpage', description: '', parameters: {} } }],
};

async function collect(runtime: ReturnType<typeof createScenarioRuntime>, params = PARAMS, text = '[scenario:fetch] 抓取') {
  const chunks = [];
  for await (const chunk of runtime.reply(params, text)) chunks.push(chunk);
  return chunks;
}

describe('场景化 mock 供应商', () => {
  it('触发前缀未命中时不接管剧本', async () => {
    const runtime = createScenarioRuntime(FILE);
    const chunks = [];
    for await (const chunk of runtime.reply(PARAMS, '普通提问')) chunks.push(chunk);
    expect(chunks).toEqual([]);
  });

  it('按轮返回工具调用，id 唯一且参数为 JSON 字符串', async () => {
    const runtime = createScenarioRuntime(FILE);
    const chunks = await collect(runtime);
    expect(chunks[0]?.finishReason).toBe('tool_calls');
    expect(chunks[0]?.toolCalls?.map((call) => call.id)).toEqual(['fetch-0-0', 'fetch-0-1']);
    expect(JSON.parse(chunks[0]!.toolCalls![0]!.function.arguments)).toEqual({
      url: 'http://fixture.local/a',
    });
  });

  it('第二轮按 {{toolState}} 展开模型实际看到的工具消息', async () => {
    const runtime = createScenarioRuntime(FILE);
    const messages: ChatMessage[] = [
      ...PARAMS.messages,
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'fetch_webpage', arguments: '{}' } }],
      },
      { role: 'tool', content: '较早的工具结果已折叠 正文', toolCallId: 'c1', name: 'fetch_webpage' },
      { role: 'tool', content: '完整正文', toolCallId: 'c2', name: 'fetch_webpage' },
    ];
    const chunks = await collect(runtime, { ...PARAMS, messages });
    const text = chunks.map((chunk) => chunk.delta).join('');
    expect(text).toContain('"count":2');
    expect(text).toContain('"folded":true');
    expect(text).toContain('"folded":false');
  });

  it('error 注入只失败一次，重试返回恢复内容', async () => {
    const runtime = createScenarioRuntime(FILE);
    const params = { ...PARAMS, messages: [{ role: 'user', content: '[scenario:overflow] 溢出' }] as ChatMessage[] };
    await expect(collect(runtime, params, '[scenario:overflow] 溢出')).rejects.toThrow(/context_length_exceeded/);
    const recovered = await collect(runtime, params, '[scenario:overflow] 溢出');
    expect(recovered.map((chunk) => chunk.delta).join('')).toContain('溢出后恢复');
  });

  it('scenarioRound 只统计最后一个用户消息之后的 assistant 消息', () => {
    expect(
      scenarioRound([
        { role: 'user', content: '旧轮' },
        { role: 'assistant', content: '旧答复' },
        { role: 'user', content: '[scenario:x] 新轮' },
        { role: 'assistant', content: null },
      ]),
    ).toBe(1);
  });

  it('toolStateProbe 无工具消息时返回空清单', () => {
    expect(toolStateProbe([])).toBe('{"count":0,"tools":[]}');
  });
});
