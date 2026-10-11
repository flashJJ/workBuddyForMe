import type { ChatMessage, TokenUsage } from '@wbfm/ai';
import type { TaskStepView } from '@wbfm/shared/schemas';
import type { ResolvedChatTarget } from '../chat/model-resolver';
import type { TaskObservation, TaskPlanDecision, TaskPlanner, TaskPlannerInput } from './types';

/** 决策输出解析失败（循环记为一次失败步，模型可据历史自我纠错） */
export class PlannerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerParseError';
  }
}

/** 注入决策上下文的历史步数上限（防爆 token） */
const HISTORY_STEP_CAP = 12;

export const TASK_PLANNER_SYSTEM_PROMPT = `你是一个桌面任务 Agent 的决策器。根据任务目标、当前屏幕观察与历史步骤，决定下一步动作。

【输出协议】只输出一个 JSON 对象，禁止输出任何其他文字或 markdown 代码块标记：
- 执行工具：{"action":"tool","tool":"工具名","args":{...},"reason":"为什么做这一步"}
- 任务完成：{"action":"done","reason":"完成依据","message":"给用户的中文总结"}
- 无法完成：{"action":"fail","reason":"失败原因","message":"给用户的中文说明"}

【决策准则】
- 每步只做一个动作；动作结果会体现在下一次观察中，不要假设未验证的结果
- 点击前优先用 uia_list 获取控件中心点坐标（比截图目测更准）；拿不到控件再按截图目测坐标
- 坐标使用截图返回元数据中的换算规则还原为真实屏幕物理坐标
- 同一动作连续失败时换路径，不要原样重试
- 目标已达成时立即输出 done，不要多做无谓动作`;

/** v1.4 M2：tool 观察模式协议（无截图；观察内容=工具结果与检索片段） */
export const TOOL_PLANNER_SYSTEM_PROMPT = `你是一个工具型任务 Agent 的决策器。根据任务目标、工具/检索结果与历史步骤，决定下一步动作。本模式不提供屏幕截图。

【输出协议】只输出一个 JSON 对象，禁止输出任何其他文字或 markdown 代码块标记：
- 执行工具：{"action":"tool","tool":"工具名","args":{...},"reason":"为什么做这一步"}
- 任务完成：{"action":"done","reason":"完成依据","message":"给用户的中文总结（含关键事实）","unfinished":["未能确认/未完成的事项"]}
- 无法完成：{"action":"fail","reason":"失败原因","message":"给用户的中文说明","unfinished":["受限事项"]}

【决策准则】
- 优先用知识检索/MCP/Flow 类工具取证：结论必须基于工具返回的真实资料，禁止臆造引用
- 每步只调一个工具；拿到足够证据后立即 done，并在 message 给出结论
- unfinished 只列真实边界（资料缺失/工具不可达），全部完成时给空数组或省略
- 同一动作连续失败时换路径，不要原样重试`;

function formatStepDigest(step: TaskStepView): string {
  const head = `#${step.stepIndex} [${step.kind}]${step.toolName ? ` ${step.toolName}` : ''}`;
  const tail = step.status === 'failed' ? `失败：${step.error}` : step.status;
  const reason = step.reason ? `（${step.reason}）` : '';
  return `${head}${reason} → ${tail}`;
}

/** 组装决策消息：system 协议 + user（目标/历史/观察文本 + 可选截图） */
export function buildPlannerMessages(input: TaskPlannerInput): ChatMessage[] {
  const recent = input.steps.slice(-HISTORY_STEP_CAP);
  const history = recent.length > 0 ? recent.map(formatStepDigest).join('\n') : '（暂无）';
  const mode = input.observeMode ?? 'screen';
  const observation: TaskObservation | null = input.observation;
  const text = [
    `【任务目标】${input.goal}`,
    `【可用工具】${input.allowedTools.join('、') || '（无）'}`,
    `【历史步骤】\n${history}`,
    `【当前观察】\n${observation?.summary ?? '（本次无观察结果）'}`,
    '请输出下一步决策 JSON。',
  ].join('\n\n');

  const content: ChatMessage['content'] =
    mode === 'screen' && observation?.imageBase64
      ? [
          { type: 'text', text },
          {
            type: 'image_url',
            image_url: { url: `data:${observation.mimeType ?? 'image/png'};base64,${observation.imageBase64}` },
          },
        ]
      : text;

  return [
    {
      role: 'system',
      content: mode === 'tool' ? TOOL_PLANNER_SYSTEM_PROMPT : TASK_PLANNER_SYSTEM_PROMPT,
    },
    { role: 'user', content },
  ];
}

/** 从模型输出提取决策 JSON：容忍 markdown 包裹与前后杂文本；非法输出抛 PlannerParseError */
export function parseDecision(content: string): TaskPlanDecision {
  const trimmed = content.trim();
  const match = /\{[\s\S]*\}/.exec(trimmed);
  if (!match) throw new PlannerParseError('输出中未找到 JSON 对象');
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    throw new PlannerParseError('JSON 解析失败');
  }
  const record = raw as Record<string, unknown>;
  const action = record.action;
  if (action !== 'tool' && action !== 'done' && action !== 'fail') {
    throw new PlannerParseError(`非法 action：${String(action)}`);
  }
  if (action === 'tool' && (typeof record.tool !== 'string' || !record.tool)) {
    throw new PlannerParseError('action=tool 时缺少 tool 字段');
  }
  return {
    action,
    ...(typeof record.tool === 'string' ? { tool: record.tool } : {}),
    ...(record.args && typeof record.args === 'object' && !Array.isArray(record.args)
      ? { args: record.args as Record<string, unknown> }
      : {}),
    reason: typeof record.reason === 'string' ? record.reason : '',
    ...(typeof record.message === 'string' ? { message: record.message } : {}),
    ...(Array.isArray(record.unfinished)
      ? { unfinished: record.unfinished.filter((x): x is string => typeof x === 'string') }
      : {}),
  };
}

/**
 * 生产决策器：调用对话模型产出决策 JSON。
 * temperature 固定 0（决策求稳）；maxTokens 限制输出长度（JSON 很小）。
 * v1.4：onUsage 可选回调，Executor 适配器据此累计角色 token 账。
 */
export function createLlmPlanner(
  target: ResolvedChatTarget,
  options: { onUsage?: (usage: TokenUsage) => void } = {},
): TaskPlanner {
  return {
    async decide(input, signal) {
      let content = '';
      const stream = target.provider.chatStream({
        model: target.model.modelId,
        messages: buildPlannerMessages(input),
        temperature: 0,
        maxTokens: 1024,
        ...(signal ? { signal } : {}),
      });
      for await (const chunk of stream) {
        if (chunk.delta) content += chunk.delta;
        if (chunk.usage) options.onUsage?.(chunk.usage);
      }
      return parseDecision(content);
    },
  };
}
