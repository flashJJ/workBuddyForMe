import { describe, expect, it } from 'vitest';
import { BEHAVIORS, DEFAULT_MOTION_CONTENT, MOTIONS, POSES } from './index';

describe('@wbfm/motion 默认内容（v4.0 M2）', () => {
  it('默认快照直接引用内置注册表，不拷贝', () => {
    expect(DEFAULT_MOTION_CONTENT.poses).toBe(POSES);
    expect(DEFAULT_MOTION_CONTENT.motions).toBe(MOTIONS);
    expect(DEFAULT_MOTION_CONTENT.behaviors).toBe(BEHAVIORS);
    expect(DEFAULT_MOTION_CONTENT.version).toBe('builtin');
  });

  it('三张注册表非空且 id 唯一', () => {
    for (const list of [POSES, MOTIONS, BEHAVIORS]) {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list.map((item) => item.id)).size).toBe(list.length);
    }
  });
});
