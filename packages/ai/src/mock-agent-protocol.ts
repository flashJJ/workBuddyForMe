import type { ChatMessage } from './types';

/**
 * v1.4 M5：WBFM_MOCK_AI 下多智能体角色协议的确定性回放（eval/e2e 专用，零外网）。
 *
 * 三类 system 协议（与 core 的 PLANNER_SYSTEM_PROMPT / REVIEWER_SYSTEM_PROMPT /
 * TOOL_PLANNER_SYSTEM_PROMPT / TASK_PLANNER_SYSTEM_PROMPT 同源标识）命中时，
 * mock 直接产出可通过 zod 校验的协议 JSON，行为由「用户目标」中的 marker 控制：
 * - [review:revise-once]  审查首轮 revise、其后 approve（返工场景）
 * - [review:reject]       审查直接 reject（终止场景）
 * - [__switch:reviewer-off]  eval 反向开关：审查恒 approve（等同审查失效）
 * - [tools:a,b]           executor 按序列调工具（交集必须在白名单内）
 * - [conclusion:文本]     executor done 结论文本（断言锚点）
 * - [slow:NNN]            每次角色调用延迟 NNN ms（急停场景）
 */

interface MockAgentReplyParams {
  messages: ChatMessage[];
}

export interface MockAgentReply {
  content: string;
  delayMs: number;
}

const PLANNER_MARKER = '规划者（Planner）';
const REVIEWER_MARKER = '审查者（Reviewer）';
const TOOL_MODE_MARKER = '工具型任务 Agent';
const SCREEN_MODE_MARKER = '桌面任务 Agent';

function fullText(messages: ChatMessage[]): string {
  return messages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n');
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

function section(text: string, header: string): string {
  const start = text.indexOf(header);
  if (start === -1) return '';
  const rest = text.slice(start + header.length);
  // 截到下一个【…】段标题
  const next = rest.search(/\n【[^】]+】/);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

/** 去掉 eval marker 后的可读目标（标题/检索词用） */
function cleanGoal(goal: string): string {
  return goal
    .replace(/\[(?:review|tools|conclusion|slow|__switch):[^\]]*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function markerValue(goal: string, key: string): string | null {
  const m = goal.match(new RegExp(`\\[${key}:([^\\]]*)\\]`));
  return m ? m[1]! : null;
}

function slowMs(goal: string): number {
  const v = markerValue(goal, 'slow');
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function plannerReply(userText: string): MockAgentReply {
  const goal = section(userText, '【用户目标】');
  const scopesLine = section(userText, '【可用工具域】');
  const kbSection = section(userText, '【知识库】');
  const kbMatch = kbSection.match(/id=([a-zA-Z0-9_-]+)/);
  // 可用工具域原样透传给子任务（knowledge 关键字由生产侧归一，具体限定名 current_time 等保持不变）
  const toolScopes = scopesLine
    .split(/[、,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('（'));
  const title = cleanGoal(goal).slice(0, 60) || '查证任务';
  return {
    delayMs: slowMs(goal),
    content: JSON.stringify({
      title,
      brief: `围绕目标「${title}」取证并给出结论；只使用声明工具域内的能力，不臆造引用。`,
      acceptance: ['给出明确结论', '结论必须基于真实工具证据'],
      toolScopes,
      knowledgeBaseId: kbMatch ? kbMatch[1]! : null,
    }),
  };
}

function reviewerReply(userText: string): MockAgentReply {
  const goal = section(userText, '【用户原始目标】');
  const roundText = section(userText, '【当前轮次】');
  const round = Math.max(0, (Number(roundText.match(/\d+/)?.[0] ?? '1') || 1) - 1);
  const standardsBlock = section(userText, '【完成标准】');
  const standardCount = Math.max(1, standardsBlock.split('\n').filter((l) => /^\d+\./.test(l.trim())).length);

  const switchedOff = goal.includes('[__switch:reviewer-off]');
  const directive = markerValue(goal, 'review');
  let verdict: 'approve' | 'revise' | 'reject' = 'approve';
  let reviewNotes: string | undefined;
  let passed = true;
  if (!switchedOff && directive === 'revise-once' && round === 0) {
    verdict = 'revise';
    reviewNotes = '证据不足：需补充权威文档依据后重新交付';
    passed = false;
  } else if (!switchedOff && directive === 'reject') {
    verdict = 'reject';
    reviewNotes = '前提不成立，目标无法通过现有能力完成';
    passed = false;
  }
  const acceptanceResults = Array.from({ length: standardCount }, (_, i) => ({
    passed,
    note: passed ? '依据充分' : `第 ${i + 1} 项未达标`,
  }));
  return {
    delayMs: slowMs(goal),
    content: JSON.stringify({ verdict, ...(reviewNotes ? { reviewNotes } : {}), acceptanceResults }),
  };
}

/** executor（task-loop 决策器，tool 观察模式）：按脚本序列调工具，随后 done */
function toolExecutorReply(userText: string): MockAgentReply {
  const goal = section(userText, '【任务目标】');
  const allowedRaw = section(userText, '【可用工具】');
  const allowed = allowedRaw.startsWith('（无')
    ? []
    : allowedRaw.split(/[、,\s]+/).map((s) => s.trim()).filter(Boolean);
  const history = section(userText, '【历史步骤】');
  // 工具名限定字符集：摘要形如「#2 [action] knowledge_search（理由） → completed」，
  // 不能用 \S+（会把中文括号理由一并吞入导致去重失效）
  const called = new Set(
    [...history.matchAll(/\[action\]\s+([a-z0-9_:]+)/gi)].map((m) => m[1]!),
  );

  const scriptedMarker = markerValue(goal, 'tools');
  const scripted = scriptedMarker
    ? scriptedMarker.split(',').map((s) => s.trim()).filter(Boolean)
    : allowed.includes('knowledge_search')
      ? ['knowledge_search']
      : [];
  const nextTool = scripted.find((tool) => allowed.includes(tool) && !called.has(tool));

  if (nextTool) {
    const args =
      nextTool === 'knowledge_search'
        ? { query: cleanGoal(goal).slice(0, 200) || '检索相关资料' }
        : {};
    return {
      delayMs: slowMs(goal),
      content: JSON.stringify({
        action: 'tool',
        tool: nextTool,
        args,
        reason: `eval 脚本：序列第 ${called.size + 1} 步调用 ${nextTool}`,
      }),
    };
  }

  // 无工具可执行（knowledge 反向开关态）→ 立即收尾且声明未竟，证据为空
  if (scripted.length === 0 || allowed.length === 0) {
    return {
      delayMs: slowMs(goal),
      content: JSON.stringify({
        action: 'done',
        reason: '无可用工具，未取得外部证据',
        message: '协作结论：无可用工具，未能取得资料依据。',
        unfinished: ['无可用知识/工具通道，无法取证'],
      }),
    };
  }

  const conclusion = markerValue(goal, 'conclusion') ?? '已按要求完成查证并给出结论';
  return {
    delayMs: slowMs(goal),
    content: JSON.stringify({
      action: 'done',
      reason: '脚本工具序列全部完成，证据充分',
      message: `协作结论：${conclusion}`,
      unfinished: [],
    }),
  };
}

/** screen 观察模式（eval 不驱动桌面执行；给确定性 done 防挂起） */
function screenExecutorReply(userText: string): MockAgentReply {
  const goal = section(userText, '【任务目标】');
  return {
    delayMs: slowMs(goal),
    content: JSON.stringify({
      action: 'done',
      reason: 'eval mock 不执行桌面操作',
      message: '协作结论：桌面观察模式在 eval mock 下直接收尾。',
    }),
  };
}

/**
 * 命中角色协议时返回确定性 JSON 文本；否则返回 null（走 mock-provider 常规分支）。
 */
export function mockAgentProtocol(params: MockAgentReplyParams): MockAgentReply | null {
  const text = fullText(params.messages);
  if (!text.includes('【输出协议】')) return null;
  const userText = lastUserText(params.messages);
  const system = params.messages.find((m) => m.role === 'system');
  const systemText = typeof system?.content === 'string' ? system.content : '';
  if (systemText.includes(REVIEWER_MARKER)) return reviewerReply(userText);
  if (systemText.includes(PLANNER_MARKER)) return plannerReply(userText);
  if (systemText.includes(TOOL_MODE_MARKER)) return toolExecutorReply(userText);
  if (systemText.includes(SCREEN_MODE_MARKER)) return screenExecutorReply(userText);
  return null;
}
