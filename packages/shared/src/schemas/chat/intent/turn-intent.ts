import { INTENT_LOW_CONFIDENCE } from '../../../constants/chat';
import type { TurnIntent, TurnIntentKind } from '../context-intelligence';

/**
 * v4.8 规则意图识别（v4.12 下沉到 shared，供 Web 发送前建议复用）。
 * 原则：意图只用于「加资源」（配额/建议），低置信度回落到默认策略，
 * 不因误判减少检索或记忆召回。
 */

export interface TurnIntentInput {
  text: string;
  /** 本轮带图片/附件：作为信号，不单独改变意图 */
  hasImages?: boolean;
  /** 助手绑定知识库且常检索：作为信号 */
  knowledgeBound?: boolean;
}

export interface MemoryCommand {
  action: 'remember' | 'forget';
  content: string;
}

const REMEMBER_RE = /^(?:请|帮我)?(?:记住|记一下|记下|别忘了)[：:，,\s]*(.{2,})/;
const FORGET_RE = /^(?:请|帮我)?(?:忘掉|忘记)(?:关于|有关)?[：:，,\s]*(.{2,})/;
const FORGET_MEMORY_RE = /(?:删掉|删除)(?:关于|有关)?(.{2,}?)(?:的)?(?:记忆|记录)/;
const REMINDER_RE = /提醒我|叫我|闹钟|到时候(?:提醒|告诉)/;
const CLARIFY_RE = /没听懂|什么意思|你刚才说|再说一遍|澄清一下|不太明白/;
const FOLLOW_UP_RE = /^(?:那|这个|那个|它|继续|接着|然后|上面|刚才|之前|前面)|(?:刚才|之前|上一条|上一轮|你刚说)/;
const TOOL_TASK_RE = /帮我|请帮|整理|生成|创建|修改|导出|转换|打开|搜索|查一下|总结|写一份|写个|做个|分析/;
const KNOWLEDGE_RE = /什么是|是什么|为什么|为何|怎么|如何|多少|哪些|哪个|谁|是否|介绍|解释|区别|对比|原理|定义/;
const MULTI_STEP_RE = /然后|并且|同时|分别|先.+再/;
/** 纯寒暄/致谢/确认：整句只有这些内容才判高置信 chitchat（v4.19 寒暄快路径的前置条件） */
const CHITCHAT_RE =
  /^(?:(?:你|您)好(?:呀|啊|哇)?|嗨|哈喽|hi|hello|hey|早上好|上午好|中午好|下午好|晚上好|早安|晚安|在吗|在不在|谢谢|多谢|感谢|thanks?|thank\s+you|辛苦了|好的?|好滴|收到|明白了?|ok|okay)[\s!！。,.，~～]*$/i;

function clipCommandContent(raw: string): string {
  return raw
    .trim()
    .replace(/[。！!？?]+$/u, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
    .trim();
}

/** 提取「记住 / 忘掉」命令；只匹配句首命令式，避免把「我忘记带钥匙」误判 */
export function extractMemoryCommand(text: string): MemoryCommand | null {
  const trimmed = text.trim();
  const remember = REMEMBER_RE.exec(trimmed);
  if (remember?.[1]) {
    const content = clipCommandContent(remember[1]);
    if (content.length >= 2) return { action: 'remember', content };
  }
  const forget = FORGET_RE.exec(trimmed) ?? FORGET_MEMORY_RE.exec(trimmed);
  if (forget?.[1]) {
    const content = clipCommandContent(forget[1]);
    if (content.length >= 2) return { action: 'forget', content };
  }
  return null;
}

interface Candidate {
  kind: TurnIntentKind;
  confidence: number;
  signal: string;
}

function pickCandidates(text: string, input: TurnIntentInput): Candidate[] {
  const candidates: Candidate[] = [];
  if (REMINDER_RE.test(text)) candidates.push({ kind: 'reminder', confidence: 0.9, signal: 'reminder-keyword' });
  if (CHITCHAT_RE.test(text)) {
    candidates.push({ kind: 'chitchat', confidence: 0.85, signal: 'chitchat-greeting' });
  }
  const memory = extractMemoryCommand(text);
  if (memory) {
    candidates.push({
      kind: 'memory_write',
      confidence: 0.88,
      signal: memory.action === 'remember' ? 'memory-remember' : 'memory-forget',
    });
  }
  if (CLARIFY_RE.test(text)) candidates.push({ kind: 'clarify', confidence: 0.8, signal: 'clarify-keyword' });
  if (FOLLOW_UP_RE.test(text)) candidates.push({ kind: 'follow_up', confidence: 0.72, signal: 'follow-up-reference' });
  if (TOOL_TASK_RE.test(text) && text.trim().length >= 8) {
    candidates.push({ kind: 'tool_task', confidence: 0.76, signal: 'tool-action-verb' });
  }
  if (KNOWLEDGE_RE.test(text) || /[?？]\s*$/.test(text)) {
    candidates.push({ kind: 'knowledge', confidence: 0.7, signal: 'knowledge-question' });
  }
  if (input.hasImages) candidates.push({ kind: 'knowledge', confidence: 0.3, signal: 'has-images' });
  if (input.knowledgeBound) candidates.push({ kind: 'knowledge', confidence: 0.2, signal: 'knowledge-bound' });
  return candidates;
}

/**
 * 同步规则识别：返回最高置信候选；低于阈值时回落 chitchat + source=fallback。
 * `signals` 保留全部命中信号（包括低置信），便于离线统计误判。
 */
export function detectTurnIntent(input: TurnIntentInput): TurnIntent {
  const text = input.text.trim();
  const candidates = pickCandidates(text, input).sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  const signals = [...new Set(candidates.map((item) => item.signal))].slice(0, 8);
  if (!best || best.confidence < INTENT_LOW_CONFIDENCE) {
    return {
      kind: 'chitchat',
      confidence: best?.confidence ?? 0.3,
      signals: signals.length > 0 ? signals : ['default'],
      suggestedTaskMode: false,
      source: 'fallback',
    };
  }
  return {
    kind: best.kind,
    confidence: best.confidence,
    signals,
    suggestedTaskMode: best.kind === 'tool_task' && (text.length >= 24 || MULTI_STEP_RE.test(text)),
    source: 'rule',
  };
}
