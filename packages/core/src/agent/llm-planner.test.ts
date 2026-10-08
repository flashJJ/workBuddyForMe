import { describe, expect, it } from 'vitest';
import type { ChatProvider } from '@wbfm/ai';
import type { ProviderModel } from '@wbfm/shared/types';
import type { ResolvedChatTarget } from '../chat/model-resolver';
import { buildPlannerMessages, createLlmPlanner, parseDecision, PlannerParseError } from './llm-planner';

describe('parseDecision（v0.7 M3 决策协议）', () => {
  it('解析纯 JSON 输出', () => {
    const d = parseDecision('{"action":"tool","tool":"mouse_click","args":{"x":1,"y":2},"reason":"点按钮"}');
    expect(d).toEqual({ action: 'tool', tool: 'mouse_click', args: { x: 1, y: 2 }, reason: '点按钮' });
  });

  it('容忍 markdown 代码块与前后杂文本', () => {
    const d = parseDecision('好的，决策如下：\n```json\n{"action":"done","reason":"完成","message":"已保存"}\n```\n以上。');
    expect(d.action).toBe('done');
    expect(d.message).toBe('已保存');
  });

  it('嵌套 args 完整提取（贪婪匹配到最外层}）', () => {
    const d = parseDecision('{"action":"tool","tool":"keyboard_press","args":{"keys":["ctrl","s"]},"reason":"保存"}');
    expect(d.args).toEqual({ keys: ['ctrl', 's'] });
  });

  it('缺 reason 默认空串；args 非对象时丢弃', () => {
    const d = parseDecision('{"action":"fail","args":"oops"}');
    expect(d.reason).toBe('');
    expect(d.args).toBeUndefined();
  });

  it.each([
    ['无 JSON', '我决定点击按钮'],
    ['非法 action', '{"action":"jump"}'],
    ['tool 缺 tool 字段', '{"action":"tool","reason":"r"}'],
    ['JSON 损坏', '{"action":"done",'],
  ])('非法输出抛 PlannerParseError：%s', (_label, content) => {
    expect(() => parseDecision(content)).toThrow(PlannerParseError);
  });
});

describe('buildPlannerMessages', () => {
  const base = {
    goal: '打开记事本',
    steps: [],
    allowedTools: ['window_list', 'mouse_click'],
    observation: { summary: '已截取屏幕', screenshotPath: '' },
  };

  it('无截图时 user 为纯文本，含目标/工具/历史/观察', () => {
    const messages = buildPlannerMessages(base);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    const text = messages[1]?.content as string;
    expect(text).toContain('打开记事本');
    expect(text).toContain('window_list');
    expect(text).toContain('（暂无）');
    expect(text).toContain('已截取屏幕');
  });

  it('有截图时 user 为图文混合内容', () => {
    const messages = buildPlannerMessages({
      ...base,
      observation: { summary: 's', screenshotPath: 'a1', imageBase64: 'Qk==', mimeType: 'image/png' },
    });
    const content = messages[1]?.content;
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts[1]?.type).toBe('image_url');
    expect(parts[1]?.image_url?.url).toBe('data:image/png;base64,Qk==');
  });
});

describe('createLlmPlanner', () => {
  it('经 provider chatStream 收集增量并解析决策', async () => {
    const provider: ChatProvider = {
      supportsTools: true,
      async testConnection() {},
      async listModels() { return []; },
      chatStream(params) {
        expect(params.temperature).toBe(0);
        expect(params.tools).toBeUndefined();
        return (async function* () {
          yield { delta: '{"action":"done",' };
          yield { delta: '"reason":"ok","message":"搞定"}' };
        })();
      },
      async embed() {
        throw new Error('unused');
      },
    };
    const target = { provider, model: { modelId: 'qwen' } as ProviderModel } as ResolvedChatTarget;
    const planner = createLlmPlanner(target);
    const decision = await planner.decide({ goal: 'g', steps: [], observation: null, allowedTools: [] });
    expect(decision.action).toBe('done');
    expect(decision.message).toBe('搞定');
  });
});
