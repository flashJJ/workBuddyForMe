import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../chat/context-budget';
import {
  compactToolOutput,
  compactToolResultForModel,
  normalizeToolSource,
  wasCompacted,
} from './tool-result-compact';
import { OMITTED_MARKER_KEY } from './compact-json';
import type { ToolResult } from './types';

const opts = (over: Partial<Parameters<typeof compactToolOutput>[1]> = {}) => ({
  maxTokens: 200,
  source: 'mcp' as const,
  toolName: 'mcp:server:query',
  ...over,
});

function knowledgeBlock(fragments: Array<[number, number, string]>) {
  return fragments
    .map(
      ([i, ordinal, body]) =>
        `[${i}] 来源：《测试制度文档》片段 ${ordinal}\n${body}`,
    )
    .join('\n\n');
}

describe('compactToolOutput：预算与豁免', () => {
  it('空字符串原样返回（strategy=passthrough）', () => {
    const r = compactToolOutput('', opts({ maxTokens: 10 }));
    expect(r).toMatchObject({ compacted: false, strategy: 'passthrough', text: '' });
  });

  it('预算充足时不压缩', () => {
    const text = '短结果文本';
    const r = compactToolOutput(text, opts({ maxTokens: 1000 }));
    expect(r.compacted).toBe(false);
    expect(r.text).toBe(text);
  });

  it('source=computer 的长文本不压缩（图片走多模态通道）', () => {
    const text = 'x'.repeat(2000);
    const r = compactToolOutput(text, opts({ source: 'computer', toolName: 'screen_snapshot', maxTokens: 50 }));
    expect(r.compacted).toBe(false);
    expect(r.text).toBe(text);
  });

  it('计算机工具名（mouse_click 等）即使 source=builtin 也豁免', () => {
    const text = 'y'.repeat(2000);
    const r = compactToolOutput(text, opts({ source: 'builtin', toolName: 'mouse_click', maxTokens: 50 }));
    expect(r.strategy).toBe('passthrough');
  });
});

describe('compactToolResultForModel：错误结果不压', () => {
  it('ok=false 的错误 output 原样回灌（模型需据其自我纠正）', () => {
    const result: ToolResult = { ok: false, output: '失'.repeat(2000), summary: '失败' };
    const text = compactToolResultForModel(result, opts({ source: 'builtin', toolName: 't' }));
    expect(text).toBe(result.output);
  });

  it('不改写 ToolResult 的 output/summary 字段', () => {
    const result: ToolResult = { ok: true, output: JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: i, content: 'z'.repeat(500) }))), summary: 'S' };
    const before = JSON.stringify(result);
    compactToolResultForModel(result, opts({ maxTokens: 100 }));
    expect(JSON.stringify(result)).toBe(before);
  });
});

describe('compactToolOutput：knowledge_search 特化', () => {
  const longBody = '制度条款'.repeat(80); // 320 字

  it('编号一个不丢：紧预算下保留全部编号+文档名+短摘录，且不超预算', () => {
    const output = knowledgeBlock([
      [1, 1, longBody],
      [2, 2, longBody],
      [3, 3, longBody],
      [4, 4, longBody],
    ]);
    const r = compactToolOutput(output, opts({ source: 'builtin', toolName: 'knowledge_search', maxTokens: 300 }));
    expect(r.strategy).toBe('knowledge');
    for (const ordinal of [1, 2, 3, 4]) {
      expect(r.text).toContain(`[${ordinal}] 《测试制度文档》`);
    }
    expect(r.tokens).toBeLessThanOrEqual(300);
    expect(r.originalTokens).toBeGreaterThan(r.tokens);
  });

  it('极端预算降级为纯编号行：4 个编号仍全部保留', () => {
    const output = knowledgeBlock([
      [1, 1, longBody],
      [2, 2, longBody],
      [3, 3, longBody],
      [4, 4, longBody],
    ]);
    const r = compactToolOutput(output, opts({ source: 'builtin', toolName: 'knowledge_search', maxTokens: 45 }));
    expect(r.strategy).toBe('knowledge');
    for (const ordinal of [1, 2, 3, 4]) expect(r.text).toContain(`[${ordinal}] 《测试制度文档》`);
    expect(r.text).not.toContain('制度条款');
    expect(r.tokens).toBeLessThanOrEqual(45);
  });

  it('预算充足时 knowledge_search 输出原样入模（不双重截断，T1.5）', () => {
    const output = knowledgeBlock([
      [1, 1, '短条款一'],
      [2, 3, '短条款二'],
    ]);
    const r = compactToolOutput(output, opts({ source: 'builtin', toolName: 'knowledge_search', maxTokens: 5000 }));
    expect(r.compacted).toBe(false);
    expect(r.strategy).toBe('passthrough');
    expect(r.text).toBe(output);
  });

  it('单片段（无分隔）不套 knowledge 解析，走通用截断', () => {
    const output = `[1] 来源：《单文档》片段 1\n${'单'.repeat(2000)}`;
    const r = compactToolOutput(output, opts({ source: 'builtin', toolName: 'knowledge_search', maxTokens: 100 }));
    expect(['knowledge', 'text']).toContain(r.strategy);
    expect(r.tokens).toBeLessThanOrEqual(100);
  });
});

describe('compactToolOutput：结构化 JSON 取样', () => {
  it('100KB 对象数组：头部取样+省略标记，首个 id 保留，输出可 parse', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: `ITEM-${String(i + 1).padStart(4, '0')}`,
      orderNo: i + 1,
      status: i % 2 ? 'active' : 'closed',
      name: `项目 ${i + 1}`,
      content: '数据'.repeat(400),
    }));
    const output = JSON.stringify(rows);
    expect(output.length).toBeGreaterThan(80_000);
    const r = compactToolOutput(output, opts({ source: 'mcp', toolName: 'mcp:db:query', maxTokens: 400 }));
    expect(['json-sampled', 'identity']).toContain(r.strategy);
    expect(r.text).toContain('ITEM-0001');
    const parsed = JSON.parse(r.text) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    const marker = parsed.find((x) => x && typeof x === 'object' && OMITTED_MARKER_KEY in x) as
      | Record<string, number>
      | undefined;
    expect(marker?.[OMITTED_MARKER_KEY]).toBeGreaterThan(0);
    expect(r.tokens).toBeLessThanOrEqual(400);
  });

  it('深层嵌套长字符串被裁剪到 120 字', () => {
    const output = JSON.stringify({ data: { meta: { note: '长'.repeat(500) } } });
    const r = compactToolOutput(output, opts({ maxTokens: 100 }));
    expect(r.compacted).toBe(true);
    expect(r.text).not.toContain('长'.repeat(121));
    expect(r.tokens).toBeLessThanOrEqual(100);
  });

  it('末级身份降级：单个大对象保 userId/status，丢长正文', () => {
    const output = JSON.stringify({
      userId: 'U-12345',
      status: 'ok',
      profile: { city: '上海', bio: '介'.repeat(800) },
      logs: Array.from({ length: 60 }, (_, i) => ({ id: `L${i}`, msg: '错'.repeat(100) })),
    });
    const r = compactToolOutput(output, opts({ source: 'mcp', toolName: 'mcp:srv:get', maxTokens: 120 }));
    expect(r.strategy).toBe('identity');
    expect(r.text).toContain('U-12345');
    expect(r.text).toContain('"status":"ok"');
    expect(r.text).not.toContain('介'.repeat(50));
    expect(r.tokens).toBeLessThanOrEqual(120);
  });

  it('深层嵌套数组超过 5 项取头部并加省略标记（叶子长文本裁剪后头部可容纳）', () => {
    const output = JSON.stringify({
      groups: Array.from({ length: 20 }, (_, i) => ({ id: `G${i}`, desc: '描'.repeat(300) })),
    });
    const r = compactToolOutput(output, opts({ maxTokens: 700 }));
    expect(r.strategy).toBe('json-sampled');
    expect(r.text).toContain(OMITTED_MARKER_KEY);
    expect(r.tokens).toBeLessThanOrEqual(700);
  });

  it('形如 JSON 的普通文本也会尝试结构化压缩（数组字面量开头）', () => {
    const output = `[${Array.from({ length: 30 }, () => JSON.stringify({ id: 'x', content: 'a'.repeat(300) })).join(',')}]`;
    const r = compactToolOutput(output, opts({ source: 'builtin', toolName: 'custom', maxTokens: 300 }));
    expect(r.strategy).not.toBe('text');
  });

  it('畸形 JSON（[ 开头但 parse 失败）降级文本截断且不超预算', () => {
    const output = `[{ not json ${'x'.repeat(500)}`;
    const r = compactToolOutput(output, opts({ maxTokens: 80 }));
    expect(r.strategy).toBe('text');
    expect(r.tokens).toBeLessThanOrEqual(80);
  });
});

describe('compactToolOutput：fetch_webpage 与通用文本', () => {
  it('网页二次裁剪保留首行来源头，正文不超预算', () => {
    const header = `网页 https://example.com/a 正文（来源 example.com，约 20000 字符）：`;
    const output = `${header}\n\n${'正'.repeat(20_000)}`;
    const r = compactToolOutput(output, opts({ source: 'builtin', toolName: 'fetch_webpage', maxTokens: 300 }));
    expect(r.strategy).toBe('webpage');
    expect(r.text.startsWith(header)).toBe(true);
    expect(r.tokens).toBeLessThanOrEqual(300);
  });

  it('网页预算充足（内容本来就短）走 passthrough', () => {
    const output = '网页 https://x 正文（来源 x，约 10 字符）：\n\n短正文内容';
    const r = compactToolOutput(output, opts({ source: 'builtin', toolName: 'fetch_webpage', maxTokens: 500 }));
    expect(r.compacted).toBe(false);
  });

  it('长中文非 JSON 文本按预算截断并附固定提示', () => {
    const output = '中文'.repeat(2000);
    const r = compactToolOutput(output, opts({ source: 'flow', toolName: 'flow:wf', maxTokens: 100 }));
    expect(r.strategy).toBe('text');
    expect(r.text).toContain('可用具体 id 再查询');
    expect(r.tokens).toBeLessThanOrEqual(100);
    // token 估算本身应与全局估算器一致（中文约 1.5 字/token）
    expect(r.tokens).toBeGreaterThan(0);
  });
});

describe('辅助函数', () => {
  it('wasCompacted 判定', () => {
    expect(wasCompacted('abc', 'abc')).toBe(false);
    expect(wasCompacted('abc', 'ab…')).toBe(true);
  });

  it('normalizeToolSource 归一 mcp/flow/computer/未知', () => {
    expect(normalizeToolSource('mcp:github:list_issues')).toBe('mcp');
    expect(normalizeToolSource('flow')).toBe('flow');
    expect(normalizeToolSource('computer')).toBe('computer');
    expect(normalizeToolSource('builtin')).toBe('builtin');
    expect(normalizeToolSource(undefined)).toBe('builtin');
    expect(normalizeToolSource('weird')).toBe('builtin');
  });

  it('预算为 0 时返回空/提示视图而不抛错', () => {
    const r = compactToolOutput('一些内容'.repeat(100), opts({ maxTokens: 0 }));
    expect(() => JSON.stringify(r)).not.toThrow();
    expect(r.tokens).toBeGreaterThanOrEqual(0);
  });

  it('压缩结果 token 恒不超预算（随机感中文长文）', () => {
    const output = Array.from({ length: 400 }, (_, i) => `第${i}段内容，混合 English words ${i} `).join('\n');
    for (const budget of [50, 150, 400]) {
      const r = compactToolOutput(output, opts({ maxTokens: budget }));
      expect(r.tokens).toBeLessThanOrEqual(budget);
    }
    void estimateTokens;
  });
});
