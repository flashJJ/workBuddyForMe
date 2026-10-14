import type { ResolvedChatTarget } from '../chat/model-resolver';
import type { MeetingSpeaker, SpeakParams } from './meeting-types';

/**
 * v1.9 M3 会议发言客户端：无工具纯对话（不下发 tools），
 * 流式收集 delta 并回调累计全文（舞台口型/会场气泡用），温度略高于协议角色以利讨论。
 */
export function createMeetingSpeaker(target: ResolvedChatTarget): MeetingSpeaker {
  return {
    async speak(params: SpeakParams) {
      let content = '';
      const stream = target.provider.chatStream({
        model: target.model.modelId,
        // 恒 [system, user]（防串角协议 §4.2），无 tools 字段
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.userContent },
        ],
        temperature: 0.7,
        ...(params.signal ? { signal: params.signal } : {}),
      });
      for await (const chunk of stream) {
        if (chunk.delta) {
          content += chunk.delta;
          params.onDelta?.(content);
        }
      }
      return { content };
    },
  };
}
