import { describe, expect, it } from 'vitest';
import { createMeetingCast, DEFAULT_MEETING_AVATAR } from '../meeting-stage-adapter';

describe('会议舞台默认形象（v3.1）', () => {
  it('默认按槽位分配内置 VRM，显式 fallback 仍优先', () => {
    const cast = createMeetingCast([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]);
    expect(cast.map((member) => member.avatarModelId)).toEqual([
      'vrm:builtin:rankaluli',
      'vrm:builtin:xuetuan',
      'vrm:builtin:feibi',
    ]);
    expect(DEFAULT_MEETING_AVATAR).toBe('vrm:builtin:xuetuan');
    expect(createMeetingCast([{ id: 'a', name: 'A' }], undefined, 'haru')[0]!.avatarModelId).toBe('haru');
  });
});
