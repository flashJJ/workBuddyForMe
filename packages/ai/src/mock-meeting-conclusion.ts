import type { ChatMessage } from './types';

/**
 * v2.6 M3：WBFM_MOCK_AI 下会议结论的确定性 JSON 回放（eval/e2e 专用，零外网）。
 *
 * 仅在系统提示命中「会议结论整理助手」时生效；输出必须能通过 shared 的
 * meetingConclusionDraftSchema，供 UI 闭环链路稳定断言。
 */

const CONCLUSION_SYSTEM_MARKER = '会议结论整理助手';

function asText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n');
  }
  return '';
}

export function mockMeetingConclusion(
  messages: ChatMessage[],
): { content: string } | null {
  const system = messages.find((message) => message.role === 'system');
  if (!system || !asText(system.content).includes(CONCLUSION_SYSTEM_MARKER)) return null;
  return {
    content: JSON.stringify({
      summary: '会议已形成可执行结论',
      decisions: ['先完成结论闭环'],
      openQuestions: [],
      actionItems: [
        { content: '跟进结论落地', ownerLabel: '未指定', ownerMemberId: null, dueAt: null },
      ],
    }),
  };
}
