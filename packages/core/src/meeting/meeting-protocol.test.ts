import { describe, expect, it } from 'vitest';
import {
  buildMeetingMessages,
  buildMeetingSystem,
  buildTranscriptLines,
  clipSpeech,
  extractAutoSuggestion,
  mapMentionsToIds,
  meetingSlotsFor,
  parseMentionNames,
  validateAutoNext,
} from './meeting-protocol';

const members = [
  { id: 'a', name: '阿策' },
  { id: 'b', name: '阿审' },
  { id: 'c', name: '阿研' },
  { id: 'd', name: '阿品' },
];

describe('v1.9 M3 会议防串角纯函数', () => {
  it('@ 解析：保序去重、忽略标点粘连、映射时剔除非成员', () => {
    const names = parseMentionNames('@阿策 先说说，@阿审 和@阿策 补充，@外人 走开');
    expect(names).toEqual(['阿策', '阿审', '外人']);
    expect(mapMentionsToIds(names, members.slice(0, 3))).toEqual(['a', 'b']);
    // 无 @ 为空（manual 不调模型）
    expect(parseMentionNames('大家怎么看')).toEqual([]);
  });

  it('转录标注：用户/助手前缀分离，窗口近 20 条截断', () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      speakerKind: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      speakerName: i % 2 === 0 ? '用户' : '阿策',
      content: `m${i}`,
    }));
    const lines = buildTranscriptLines(entries);
    expect(lines).toHaveLength(20);
    // 近 20 条从 m5 起：i=5 奇数=助手，i=6 偶数=用户
    expect(lines[0]).toBe('[助手·阿策] m5');
    expect(lines[1]).toBe('[用户·用户] m6');
  });

  it('system 段：身份规则含当前成员名、只注入自己的卡、附最近转录', () => {
    const system = buildMeetingSystem({
      selfName: '阿审',
      userLabel: '用户',
      personaBlock: '【角色卡】\n你是严谨的审查者',
      transcriptLines: ['[助手·阿策] 我先来'],
      identityRuleTemplate: '你只能代表 [助手·{name}] 发言',
      lengthRule: '不超过 200 字',
    });
    expect(system).toContain('你只能代表 [助手·阿审] 发言');
    expect(system).toContain('你是严谨的审查者');
    expect(system).toContain('[助手·阿策] 我先来');
    // 其他成员卡内容不得出现
    expect(system).not.toContain('阿研');
  });

  it('请求形状恒为 [system, user]，尾条 role=user', () => {
    const messages = buildMeetingMessages('SYS', '本轮议题');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    expect(messages.at(-1)?.role).toBe('user');
  });

  it('发言截断：≤200 原样，超长截断并加省略号标记', () => {
    expect(clipSpeech('短').truncated).toBe(false);
    const long = clipSpeech('字'.repeat(250));
    expect(long.text).toHaveLength(200);
    expect(long.truncated).toBe(true);
    expect(long.text.endsWith('…')).toBe(true);
  });

  it('auto 建议解析：末尾 JSON 提名被剥离；无/坏 JSON 静默为 null', () => {
    const ok = extractAutoSuggestion('我说完了\n{"next_speaker":"阿研"}');
    expect(ok.nextSpeakerName).toBe('阿研');
    expect(ok.speech).toBe('我说完了');
    expect(extractAutoSuggestion('没有建议').nextSpeakerName).toBeNull();
    expect(extractAutoSuggestion('{坏 json').nextSpeakerName).toBeNull();
  });

  it('next-speaker 四种非法建议全部拒绝，合法建议通过', () => {
    const base = { members: members.slice(0, 3), currentSpeakerId: 'a', previousSpeakerId: 'c', nextRound: 2 };
    expect(validateAutoNext({ ...base, suggestedName: '外人' })).toMatchObject({ ok: false, reason: 'not-member' });
    expect(validateAutoNext({ ...base, suggestedName: '阿策' })).toMatchObject({ ok: false, reason: 'self' });
    expect(validateAutoNext({ ...base, suggestedName: '阿研' })).toMatchObject({ ok: false, reason: 'repeat' });
    expect(validateAutoNext({ ...base, suggestedName: '阿审', nextRound: 9 })).toMatchObject({
      ok: false,
      reason: 'round-limit',
    });
    // 合法：换一位、未连续、轮次内
    expect(validateAutoNext({ ...base, suggestedName: '阿审' })).toEqual({ ok: true, speakerId: 'b' });
    // 首轮 previousSpeakerId=null 不判 repeat
    expect(
      validateAutoNext({ ...base, suggestedName: '阿研', previousSpeakerId: null, currentSpeakerId: 'b' }),
    ).toEqual({ ok: true, speakerId: 'c' });
  });

  it('席次映射：2/3/4 人槽位正确', () => {
    expect(meetingSlotsFor(2)).toEqual(['left', 'right']);
    expect(meetingSlotsFor(3)).toEqual(['left', 'center', 'right']);
    expect(meetingSlotsFor(4)).toEqual(['left', 'center', 'right', 'farRight']);
  });
});
