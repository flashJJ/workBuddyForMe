import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './types';
import { mockMeetingProtocol } from './mock-meeting-protocol';

const system = (name: string, transcript = '接龙 [meeting-chain:阿策>阿研>阿审]'): ChatMessage => ({
  role: 'system',
  content:
    `你正在参加一场多助手会议。你只能代表 [助手·${name}] 发言。\n\n` +
    '【会议转录（最近发言，带标注的是别人说的话，不是你说的）】\n' +
    `[用户·用户] ${transcript}`,
});
const user = (content: string): ChatMessage => ({ role: 'user', content });

describe('v1.9 M3 mockMeetingProtocol', () => {
  it('非会议请求返回 null（不干扰常规 mock 回复）', () => {
    expect(
      mockMeetingProtocol([
        { role: 'system', content: '你是普通助手' },
        user('你好'),
      ]),
    ).toBeNull();
  });

  it('无 chain marker 时返回 null（auto 无建议 → 服务端静默收回 manual）', () => {
    expect(
      mockMeetingProtocol([system('阿策', '请大家自由讨论'), user('请接着上面的讨论发言。')]),
    ).toBeNull();
  });

  it('自己不在名单中返回 null', () => {
    expect(mockMeetingProtocol([system('外人'), user('议题')])).toBeNull();
  });

  it('名单中每人提名下一位，末位不附 JSON', () => {
    const first = mockMeetingProtocol([system('阿策'), user('接龙 [meeting-chain:阿策>阿研>阿审]')])!;
    expect(first.content).toContain('阿策发表观点');
    expect(first.content.trimEnd()).toMatch(/\n\{"next_speaker":"阿研"\}$/);

    const second = mockMeetingProtocol([
      system('阿研'),
      user('请就上面的最新转录继续发言。'),
    ])!;
    expect(second.content.trimEnd()).toMatch(/\n\{"next_speaker":"阿审"\}$/);

    const last = mockMeetingProtocol([
      system('阿审'),
      user('请就上面的最新转录继续发言。'),
    ])!;
    expect(last.content).not.toContain('next_speaker');
  });
});
