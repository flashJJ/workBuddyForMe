import { describe, expect, it } from 'vitest';
import {
  skillNameParamSchema,
  skillVersionParamSchema,
  skillVersionViewSchema,
  skillVersionsResponseSchema,
} from './skill';

describe('v2.14 技能版本契约', () => {
  it('版本视图：checksum/sizeBytes/active 字段校验', () => {
    const view = skillVersionViewSchema.parse({
      id: 'v1',
      version: '1.0.0',
      checksum: 'a'.repeat(64),
      sizeBytes: 12,
      createdAt: '2026-10-31T00:00:00.000Z',
      active: true,
    });
    expect(view.active).toBe(true);
    expect(() => skillVersionViewSchema.parse({ ...view, sizeBytes: -1 })).toThrow();
    expect(() => skillVersionViewSchema.parse({ ...view, active: 'yes' })).toThrow();
  });

  it('版本列表响应：空快照时 versioningAvailable=false 仍合法', () => {
    expect(skillVersionsResponseSchema.parse({ versions: [], versioningAvailable: false }))
      .toEqual({ versions: [], versioningAvailable: false });
  });

  it('路径参数：拒绝路径穿越与非法技能名', () => {
    expect(skillNameParamSchema.parse({ name: 'weekly-report' }).name).toBe('weekly-report');
    expect(() => skillNameParamSchema.parse({ name: '../etc' })).toThrow();
    expect(() => skillNameParamSchema.parse({ name: ' ' })).toThrow();
    expect(
      skillVersionParamSchema.parse({ name: 'my-skill', version: '1.0.0-beta.1' }).version,
    ).toBe('1.0.0-beta.1');
    expect(() => skillVersionParamSchema.parse({ name: 'my-skill', version: '' })).toThrow();
  });
});
