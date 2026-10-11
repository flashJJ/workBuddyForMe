import { describe, expect, it } from 'vitest';
import type { ChatProvider } from '@wbfm/ai';
import type { ProviderModel } from '@wbfm/shared/types';
import type { ResolvedChatTarget } from '../chat/model-resolver';
import type { TaskStepView } from '@wbfm/shared/schemas';
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

  it('tool 模式注入子任务要求/验收标准/授权知识库/工具用途说明', () => {
    const messages = buildPlannerMessages({
      goal: '帮我规划下职业发展。',
      steps: [],
      observation: { summary: '工具模式观察', screenshotPath: '' },
      allowedTools: ['knowledge_search'],
      observeMode: 'tool',
      subtask: { brief: '先从《我的简历》读取教育与工作经历', acceptance: ['给出 1/3/5 年目标', '列出能力差距'] },
      knowledgeBaseNames: ['我的简历'],
      toolCatalog: ['knowledge_search：在用户授权的私有知识库中语义检索资料。'],
    });
    const text = messages[1]?.content as string;
    expect(text).toContain('【子任务具体要求】先从《我的简历》读取教育与工作经历');
    expect(text).toContain('【完成必须满足的验收标准】');
    expect(text).toContain('1. 给出 1/3/5 年目标');
    expect(text).toContain('《我的简历》');
    expect(text).toContain('knowledge_search：在用户授权的私有知识库中语义检索资料。');
    // 硬规则进入 system 提示词：未检索禁止以资料缺失为由 fail
    const systemText = messages[0]?.content as string;
    expect(systemText).toContain('严禁以');
  });

  it('tool 模式但缺省子任务上下文时区块缺省，不渲染空标题', () => {
    const messages = buildPlannerMessages({
      goal: 'g',
      steps: [],
      observation: null,
      allowedTools: [],
      observeMode: 'tool',
      maxSteps: 20,
    });
    const text = messages[1]?.content as string;
    expect(text).not.toContain('【子任务具体要求】');
    expect(text).not.toContain('【已授权可检索的私有知识库】');
    expect(text).not.toContain('【工具用途说明】');
    // 预算区块恒定展示，首轮检索 0 次
    expect(text).toContain('【执行预算】已用动作 0/20');
    expect(text).toContain('knowledge_search 已调用 0/3 次');
  });

  it('检索达 3 次上限时预算区块强提示必须 done，且系统提示词声明上限', () => {
    const retrievalSteps = Array.from({ length: 3 }, (_, i) => ({
      stepIndex: i * 2 + 2,
      kind: 'action',
      toolName: 'knowledge_search',
      status: 'completed',
      reason: `检索${i}`,
      resultJson: JSON.stringify({ summary: `命中 ${i + 1} 片` }),
    })) as unknown as TaskStepView[];
    const messages = buildPlannerMessages({
      goal: 'g',
      steps: retrievalSteps,
      observation: null,
      allowedTools: ['knowledge_search'],
      observeMode: 'tool',
      maxSteps: 20,
    });
    const text = messages[1]?.content as string;
    expect(text).toContain('已用动作 3/20');
    expect(text).toContain('knowledge_search 已调用 3/3 次（已达上限，禁止再检索，本轮必须 done 输出完整结论）');
    expect(messages[0]?.content as string).toContain('全任务累计最多调用 3 次');
  });

  it('screen 模式同样注入子任务/知识库/工具目录（避免看无关截图误 fail）', () => {
    const messages = buildPlannerMessages({
      ...base,
      observeMode: 'screen',
      allowedTools: ['knowledge_search'],
      subtask: { brief: '读取简历并规划', acceptance: ['x'] },
      knowledgeBaseNames: ['我的简历'],
      toolCatalog: ['knowledge_search：在私有知识库中语义检索资料。'],
      maxSteps: 20,
    });
    const text = messages[1]?.content as string;
    expect(text).toContain('【子任务具体要求】读取简历并规划');
    expect(text).toContain('《我的简历》');
    expect(text).toContain('knowledge_search：在私有知识库中语义检索资料。');
    expect(text).toContain('【执行预算】已用动作 0/20');
    // screen 模式授权了知识库：必须有「未检索禁 fail / 忽略无关画面」硬规则
    expect(text).toContain('【重要规则】');
    expect(text).toContain('当前页面与任务无关');
  });

  it('screen 模式未授权知识库（纯桌面任务）时不加知识硬规则', () => {
    const messages = buildPlannerMessages({
      ...base,
      observeMode: 'screen',
      allowedTools: ['mouse_click'],
    });
    const text = messages[1]?.content as string;
    expect(text).not.toContain('【重要规则】');
  });

  it('历史动作步成功时 digest 附带结果摘要，失败时附带错误', () => {
    const okStep = {
      stepIndex: 2,
      kind: 'action',
      toolName: 'knowledge_search',
      status: 'completed',
      reason: '查简历',
      resultJson: JSON.stringify({ summary: '命中 3 个片段：教育背景', output: '正文不进 digest' }),
    } as unknown as TaskStepView;
    const badStep = {
      stepIndex: 4,
      kind: 'action',
      toolName: 'knowledge_search',
      status: 'failed',
      reason: '再查',
      error: '检索词不能为空',
      resultJson: null,
    } as unknown as TaskStepView;
    const messages = buildPlannerMessages({
      ...base,
      observeMode: 'tool',
      steps: [okStep, badStep],
    });
    const text = messages[1]?.content as string;
    expect(text).toContain('knowledge_search（查简历） → completed：命中 3 个片段：教育背景');
    expect(text).toContain('knowledge_search（再查） → 失败：检索词不能为空');
    expect(text).not.toContain('正文不进 digest');
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
