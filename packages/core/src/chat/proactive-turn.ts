import { HISTORY_MESSAGE_SAFETY_CAP, type TokenUsage } from '@wbfm/shared';
import { startRun, type ChatMessage, type TraceHandle } from '@wbfm/ai';
import type { ServiceDeps } from '../services/deps';
import { createAssistantsService } from '../services/assistant-service';
import { createConversationService } from '../services/conversation-service';
import { resolveChatTarget } from './model-resolver';
import { buildSystemPrompt } from './prompt';
import { runProviderTurn } from './tool-runner';
import { normalizeFailure } from './orchestrator-helpers';
import type { OrchestratorEvent } from './types';

/** 主动轮入参：助手必填，会话可选（无会话时不带历史，仅问候开场） */
export interface StreamProactiveInput {
  assistantId: string;
  conversationId?: string;
  signal?: AbortSignal;
}

/** 主动轮携带的最近历史条数：够承接话题即可，轻量优先 */
export const PROACTIVE_HISTORY_MESSAGES = 8;

/**
 * 主动搭话触发指令（以 user 角色下发，模型直接产出要说出口的话）。
 * 约束短、自然、不解释动机；情绪标签由助手表情开关经系统提示词控制。
 */
export const PROACTIVE_TRIGGER_PROMPT = [
  '【主动搭话指令】',
  '用户已经有一段时间没有发消息了。现在请你主动开口，发起一次轻松自然的搭话：',
  '- 只说 1-2 句话，不超过 60 个字；',
  '- 可以结合上面的对话内容追问一句、分享一个相关的有趣冷知识，或给一句简短的问候；',
  '- 不要罗列选项，不要解释你为什么说话，不要出现“空闲”“主动”“很久没理我”之类的字眼；',
  '- 直接输出要说出口的话本身。',
].join('\n');

/** 主动轮不落库的临时消息 id 前缀（前端据此与真实消息区分） */
export const PROACTIVE_MESSAGE_PREFIX = 'proactive-';

/**
 * 模型零文本返回时的主动轮兜底（主动轮不挂工具，不能复用工具轮限文案）。
 * 用一句中性短问候保住「角色开口了」的体验，长度同样遵守触发指令的短约束。
 */
export const PROACTIVE_EMPTY_FALLBACK = '嗨，今天有什么我可以帮你的吗？';

export function createProactiveMessageId(): string {
  return `${PROACTIVE_MESSAGE_PREFIX}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * F8 主动说话的轻量轮次（skip-history）：
 * - 不创建/写入任何消息（用户消息与助手回复均不落库）、不跑 RAG/记忆/技能/工具/压缩；
 * - 仅读取最近少量历史承接话题，直接流式产出一句短搭话；
 * - 事件协议与 streamChat 一致，meta 带 proactive:true 供前端以临时气泡+语音呈现。
 */
export function createProactiveTurn(deps: ServiceDeps) {
  const assistants = createAssistantsService(deps);
  const conversations = createConversationService(deps);

  return async function* streamProactiveTurn(
    input: StreamProactiveInput,
  ): AsyncGenerator<OrchestratorEvent> {
    const assistant = assistants.get(input.assistantId);

    let target;
    try {
      target = resolveChatTarget(deps, assistant);
    } catch (error) {
      yield { event: 'error', data: normalizeFailure(error) };
      return;
    }

    const messageId = createProactiveMessageId();
    const conversationId = input.conversationId ?? '';
    yield {
      event: 'meta',
      data: { messageId, conversationId, proactive: true },
    };

    // 只读最近历史（纯文本承接话题；图片/附件不进主动轮，保持轻量与无依赖）
    const history: ChatMessage[] = [];
    if (input.conversationId) {
      try {
        const recent = conversations
          .recentMessagesAfter(input.conversationId, 0, HISTORY_MESSAGE_SAFETY_CAP)
          .slice(-PROACTIVE_HISTORY_MESSAGES);
        for (const m of recent) {
          if (m.content.trim()) history.push({ role: m.role, content: m.content });
        }
      } catch {
        // 会话不存在/已删除：退化为无历史开场，不阻断主动轮
      }
    }

    const outgoing: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(assistant, null) },
      ...history,
      { role: 'user', content: PROACTIVE_TRIGGER_PROMPT },
    ];

    const trace: TraceHandle | null = await startRun({
      name: 'chat-proactive',
      runType: 'chain',
      inputs: { assistantId: input.assistantId, conversationId },
      metadata: { app: 'workbuddy', proactive: true },
    });

    let full = '';
    let usage: TokenUsage | null = null;
    try {
      const turn = runProviderTurn({
        target,
        assistant,
        messages: outgoing,
        tools: [],
        signal: input.signal,
        traceParent: trace,
      });
      while (true) {
        const step = await turn.next();
        if (step.done) {
          usage = step.value.usage;
          break;
        }
        if (step.value.event === 'delta') full += step.value.data.content;
        yield step.value;
      }
      if (input.signal?.aborted) {
        yield { event: 'done', data: { content: full, usage } };
        return;
      }
      if (!full.trim()) {
        full = PROACTIVE_EMPTY_FALLBACK;
        yield { event: 'delta', data: { content: full } };
      }
      yield { event: 'done', data: { content: full, usage } };
    } catch (error) {
      await trace?.end(undefined, error);
      if (input.signal?.aborted) {
        yield { event: 'done', data: { content: full, usage } };
        return;
      }
      yield { event: 'error', data: normalizeFailure(error) };
      return;
    }
    await trace?.end({ content: full, usage, aborted: false });
  };
}
