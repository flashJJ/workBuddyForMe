import type { ChatMessage, TokenUsage } from '@wbfm/ai';
import type { TaskStepView } from '@wbfm/shared/schemas';
import type { ResolvedChatTarget } from '../chat/model-resolver';
import { toModelText } from '../i18n/system-text';
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
/** 单任务内 knowledge_search 累计调用上限：防止弱模型不断换词检索、耗尽步数仍不产出 */
export const TOOL_RETRIEVAL_CALL_CAP = 3;

export const TOOL_PLANNER_SYSTEM_PROMPT = `你是一个工具型任务 Agent 的决策器。根据任务目标、工具/检索结果与历史步骤，决定下一步动作。本模式不提供屏幕截图。

【输出协议】只输出一个 JSON 对象，禁止输出任何其他文字或 markdown 代码块标记：
- 执行工具：{"action":"tool","tool":"工具名","args":{...},"reason":"为什么做这一步"}
- 任务完成：{"action":"done","reason":"完成依据","message":"给用户的中文总结（含关键事实）","unfinished":["未能确认/未完成的事项"]}
- 无法完成：{"action":"fail","reason":"失败原因","message":"给用户的中文说明","unfinished":["受限事项"]}

【决策准则】
- 优先用知识检索/MCP/Flow 类工具取证：结论必须基于工具返回的真实资料，禁止臆造引用
- 已授权知识库且任务需要用户私有资料时，第一步必须调用 knowledge_search 实际检索；在拿到任何工具结果之前，严禁以「资料缺失/简历缺失/需要用户提供」为由输出 fail——fail 只能用于已尽力检索但工具确实无法取得所需信息之后
- knowledge_search 全任务累计最多调用 ${TOOL_RETRIEVAL_CALL_CAP} 次（每次换不同角度的关键词）；达到上限后禁止再次检索，必须立即基于已取得的资料 done，资料缺口在 unfinished 中列明
- 检索是手段不是目的：拿到核心资料后尽快综合输出完整结论；不要试图用检索覆盖每个细节，缺失细节明确标注假设/待补充即可
- 每步只调一个工具；拿到足够证据后立即 done，并在 message 给出结论
- unfinished 只列真实边界（资料缺失/工具不可达），全部完成时给空数组或省略
- 同一动作连续失败时换路径，不要原样重试`;

function parseStepResultJson(step: TaskStepView): { summary?: string } {
  if (!step.resultJson) return {};
  try {
    return JSON.parse(step.resultJson) as { summary?: string };
  } catch {
    return {};
  }
}

function formatStepDigest(step: TaskStepView): string {
  const head = `#${step.stepIndex} [${step.kind}]${step.toolName ? ` ${step.toolName}` : ''}`;
  // 模型边界：reason/error 可能是系统消息标记，固定解码为中文再喂模型
  const tail = step.status === 'failed' ? `失败：${toModelText(step.error)}` : step.status;
  const reason = step.reason ? `（${toModelText(step.reason)}）` : '';
  // 成功动作补结果摘要（如「命中 6 个片段：教育背景」）：完整正文在当前观察，历史只留线索
  const resultSummary =
    step.kind === 'action' && step.status === 'completed'
      ? parseStepResultJson(step).summary?.slice(0, 200)
      : undefined;
  return `${head}${reason} → ${tail}${resultSummary ? `：${resultSummary}` : ''}`;
}

/** 组装决策消息：system 协议 + user（目标/子任务/工具/历史/观察文本 + 可选截图） */
export function buildPlannerMessages(input: TaskPlannerInput): ChatMessage[] {
  const recent = input.steps.slice(-HISTORY_STEP_CAP);
  const history = recent.length > 0 ? recent.map(formatStepDigest).join('\n') : '（暂无）';
  const mode = input.observeMode ?? 'screen';
  const observation: TaskObservation | null = input.observation;
  const blocks = [`【任务目标】${toModelText(input.goal)}`];
  // 协作子任务单/授权知识库/工具目录/预算：两种观察模式都需要——
  // screen 模式若缺这些，模型看到与知识任务无关的桌面截图会误判「页面与任务无关」直接 fail
  if (input.subtask?.brief) blocks.push(`【子任务具体要求】${toModelText(input.subtask.brief)}`);
  if (input.subtask?.acceptance?.length) {
    blocks.push(
      `【完成必须满足的验收标准】\n${input.subtask.acceptance.map((a, i) => `${i + 1}. ${toModelText(a)}`).join('\n')}`,
    );
  }
  if (input.knowledgeBaseNames?.length) {
    blocks.push(
      `【已授权可检索的私有知识库】${input.knowledgeBaseNames.map((n) => `《${n}》`).join('、')}\n` +
        '用户的私有资料就在上述库中（如简历/项目/制度文档），需要这些资料时立即用 knowledge_search 检索库内片段。',
    );
  }
  blocks.push(`【可用工具】${input.allowedTools.join('、') || '（无）'}`);
  if (input.toolCatalog?.length) {
    blocks.push(`【工具用途说明】\n${input.toolCatalog.map((t) => `- ${t}`).join('\n')}`);
  }
  // 预算与检索计数前置：弱模型易无限换词检索耗尽步数，需每轮强提示
  const usedActions = input.steps.filter((s) => s.kind === 'action').length;
  const retrievalCalls = input.steps.filter(
    (s) => s.kind === 'action' && s.toolName === 'knowledge_search' && s.status === 'completed',
  ).length;
  blocks.push(
    `【执行预算】已用动作 ${usedActions}${input.maxSteps ? `/${input.maxSteps}` : ''}；` +
      `knowledge_search 已调用 ${retrievalCalls}/${TOOL_RETRIEVAL_CALL_CAP} 次` +
      `${retrievalCalls >= TOOL_RETRIEVAL_CALL_CAP ? '（已达上限，禁止再检索，本轮必须 done 输出完整结论）' : '（达到上限后必须立即 done）'}`,
  );
  // screen 模式补知识任务硬规则（tool 模式同样的规则已在 system 提示词中声明）：
  // 即使 Planner 误带 desktop 导致截图观察与任务无关，模型也必须先检索授权库，禁止看屏 fail
  if (mode === 'screen' && input.allowedTools.includes('knowledge_search')) {
    blocks.push(
      '【重要规则】本任务已授权私有知识库，需要用户资料时必须先实际调用 knowledge_search 取证；' +
        '未取得任何检索结果前，严禁以「资料缺失/当前页面与任务无关/需要用户提供」为由输出 fail。' +
        '屏幕截图仅在需要操作桌面应用时才相关；做资料分析/规划/写作时若画面与任务无关，忽略画面直接检索。',
    );
  }
  blocks.push(`【历史步骤】\n${history}`, `【当前观察】\n${toModelText(observation?.summary ?? '（本次无观察结果）')}`, '请输出下一步决策 JSON。');
  const text = blocks.join('\n\n');

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
