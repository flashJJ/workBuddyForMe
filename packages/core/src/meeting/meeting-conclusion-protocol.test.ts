import { describe, expect, it } from 'vitest';
import type { MeetingMessageRecord, MeetingRecord } from '@wbfm/shared/types';
import {
  CONCLUSION_CHUNK_MAX,
  buildConclusionUserPrompt,
  parseConclusionDraft,
  splitTranscript,
} from './meeting-conclusion-protocol';

const meeting: MeetingRecord = {
  id: 'm1',
  topic: '评审方案',
  memberIds: ['a', 'b'],
  mode: 'manual',
  modelId: null,
  status: 'finished',
  autoRounds: 0,
  createdAt: 't',
  finishedAt: 't',
};

function message(seq: number, content: string): MeetingMessageRecord {
  return {
    id: `x${seq}`,
    meetingId: 'm1',
    seq,
    speakerKind: 'user',
    speakerId: null,
    speakerName: '用户',
    content,
    emotionTag: null,
    createdAt: 't',
  };
}

describe('meeting-conclusion-protocol', () => {
  it('解析：容忍 Markdown 围栏/前后杂文本，非法形状报字段问题', () => {
    const ok = parseConclusionDraft(
      '说明\n```json\n{"summary":"结论","decisions":[],"openQuestions":[],"actionItems":[]}\n```\n尾巴',
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.draft.summary).toBe('结论');

    const bad = parseConclusionDraft('{"summary":"","decisions":"x"}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe('invalid_shape');
      expect(bad.issues.length).toBeGreaterThan(0);
    }
  });

  it('切块：按消息边界，超过上限保留首尾并插入省略标记', () => {
    const messages = Array.from({ length: 40 }, (_, i) => message(i + 1, 'x'.repeat(1500)));
    const chunks = splitTranscript(messages);
    expect(chunks.length).toBe(CONCLUSION_CHUNK_MAX);
    expect(chunks).toContain('【中间转录过长，已省略】');
    expect(chunks[0]).toContain('#1');
  });

  it('提示词：包含议题、成员 id 与压缩标记', () => {
    const prompt = buildConclusionUserPrompt({
      meeting,
      members: [{ id: 'a', name: '阿策' }],
      transcript: '摘要内容',
      compressed: true,
    });
    expect(prompt).toContain('评审方案');
    expect(prompt).toContain('id=a');
    expect(prompt).toContain('分段摘要');
  });
});
