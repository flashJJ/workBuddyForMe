import type { ChatMessage } from './types';

/**
 * v1.9 M3：WBFM_MOCK_AI 下多助手会议的确定性接龙回放（eval/e2e 专用，零外网）。
 *
 * 与 mock-agent-protocol 同构：检测会议 system 身份标记，行为由**用户议题**中的
 * marker 控制（议题随用户消息落库进转录，后续发言者也能读到同一份名单——
 * 不依赖任何请求外状态，模拟真实模型只能依据转录决策）：
 *
 * - [meeting-chain:名1>名2>名3]  按名单依次提名下一位；末位不附 JSON → 接龙收尾
 * - 无 marker（或自己不在名单）    返回 null → 走 mock-provider 常规回复
 *                                   （无 next_speaker，服务端静默收回 manual）
 *
 * 越权/自我/复读提名等反向场景由服务端纯函数硬校验，单测已覆盖，mock 不模拟非法建议。
 */

export interface MockMeetingReply {
  content: string;
}

const MEETING_SYSTEM_MARKER = '多助手会议';
const SELF_PATTERN = /你只能代表\s*\[助手·([^\]]+)\]/;
const CHAIN_PATTERN = /\[meeting-chain:([^\]]+)\]/;

function asText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n');
  }
  return '';
}

function parseRoster(marker: string): string[] {
  return marker
    .split(/[>＞,，]/u)
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * 命中会议身份协议时返回确定性发言（末尾可能带 next_speaker JSON）；否则 null。
 */
export function mockMeetingProtocol(messages: ChatMessage[]): MockMeetingReply | null {
  const system = messages.find((m) => m.role === 'system');
  const systemText = system ? asText(system.content) : '';
  if (!systemText.includes(MEETING_SYSTEM_MARKER)) return null;

  const selfMatch = SELF_PATTERN.exec(systemText);
  if (!selfMatch) return null;
  const selfName = selfMatch[1]!;

  // 名单来自用户议题 marker：首位在 user 锚点读到，后续发言者从转录 [用户·] 行读到
  const fullText = messages.map((m) => asText(m.content)).join('\n');
  const chainMatch = CHAIN_PATTERN.exec(fullText);
  if (!chainMatch) return null;
  const roster = parseRoster(chainMatch[1]!);
  const selfIndex = roster.indexOf(selfName);
  if (selfIndex === -1) return null;

  const speech = `（会议 mock）${selfName}发表观点：按接龙名单推进讨论。`;
  const nextName = roster[selfIndex + 1];
  if (!nextName) return { content: speech };
  return { content: `${speech}\n{"next_speaker":"${nextName}"}` };
}
