import { describe, expect, it } from 'vitest';
import { buildChatBody } from './payloads';
import { createWireToolNameCodec } from './tool-name-codec';

const flowTool = (id: string) => ({
  type: 'function' as const,
  function: { name: `flow:${id}`, description: '流程', parameters: { type: 'object' } },
});

describe('wire 工具名 codec', () => {
  it('把限定名转义为上游接受的字符集，并可还原', () => {
    const codec = createWireToolNameCodec({
      model: 'm',
      messages: [],
      tools: [flowTool('b0000005-0000-4000-8000-000000000005')],
    });
    const original = 'flow:b0000005-0000-4000-8000-000000000005';
    const wire = codec.toWire(original);
    expect(wire).toBe('flow_b0000005-0000-4000-8000-000000000005');
    expect(wire).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(codec.toOriginal(wire)).toBe(original);
  });

  it('多个限定名逐一转义（正则不保留状态，不能只转义第一个）', () => {
    const originals = ['flow:a', 'flow:b', 'mcp:fs:read', 'mcp:db:query'];
    const codec = createWireToolNameCodec({
      model: 'm',
      messages: [],
      tools: originals.map((name) => ({
        type: 'function' as const,
        function: { name, description: '', parameters: {} },
      })),
    });
    for (const name of originals) {
      const wire = codec.toWire(name);
      expect(wire).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(codec.toOriginal(wire)).toBe(name);
    }
  });

  it('已合法的名字保持原样，转义碰撞时追加序号且互不覆盖', () => {
    const codec = createWireToolNameCodec({
      model: 'm',
      messages: [],
      tools: [
        { type: 'function', function: { name: 'mcp_fs_query', description: '', parameters: {} } },
        { type: 'function', function: { name: 'mcp:fs:query', description: '', parameters: {} } },
      ],
    });
    expect(codec.toWire('mcp_fs_query')).toBe('mcp_fs_query');
    const escaped = codec.toWire('mcp:fs:query');
    expect(escaped).not.toBe('mcp_fs_query');
    expect(escaped).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(codec.toOriginal('mcp_fs_query')).toBe('mcp_fs_query');
    expect(codec.toOriginal(escaped)).toBe('mcp:fs:query');
  });

  it('超长名字截断后仍可唯一还原', () => {
    const long = `mcp:${'s'.repeat(64)}:${'t'.repeat(64)}`;
    const codec = createWireToolNameCodec({
      model: 'm',
      messages: [],
      tools: [{ type: 'function', function: { name: long, description: '', parameters: {} } }],
    });
    const wire = codec.toWire(long);
    expect(wire.length).toBeLessThanOrEqual(64);
    expect(codec.toOriginal(wire)).toBe(long);
  });
});

describe('buildChatBody 应用 codec', () => {
  it('工具声明、历史 tool_calls 与 tool 消息名都转义', () => {
    const body = buildChatBody({
      model: 'deepseek-flash',
      tools: [flowTool('wf-1')],
      messages: [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'flow:wf-1', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', content: 'ok', toolCallId: 'call-1', name: 'flow:wf-1' },
      ],
    });
    expect(body.tools?.[0]?.function.name).toBe('flow_wf-1');
    expect(body.messages[0]?.tool_calls?.[0]?.function.name).toBe('flow_wf-1');
    expect(body.messages[1]?.name).toBe('flow_wf-1');
  });

  it('纯对话不带 tools 时不改变消息内容', () => {
    const body = buildChatBody({
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: '你好' }],
    });
    expect(body.tools).toBeUndefined();
    expect(body.messages[0]).toEqual({ role: 'user', content: '你好' });
  });
});
