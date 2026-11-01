import { describe, expect, it } from 'vitest';
import {
  skillNameParamSchema,
  skillVersionDeleteResponseSchema,
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
    expect(
      skillVersionsResponseSchema.parse({ versions: [], versioningAvailable: false, totalBytes: 0 }),
    ).toEqual({ versions: [], versioningAvailable: false, totalBytes: 0 });
    expect(() =>
      skillVersionsResponseSchema.parse({ versions: [], versioningAvailable: false }),
    ).toThrow();
  });

  it('删除响应：结果字段与剩余版本列表', () => {
    const parsed = skillVersionDeleteResponseSchema.parse({
      deleted: { version: '1.0.0', rowsRemoved: 1, freedBytes: 1024, dirDeleted: true },
      versions: { versions: [], versioningAvailable: false, totalBytes: 0 },
    });
    expect(parsed.deleted.freedBytes).toBe(1024);
    expect(() =>
      skillVersionDeleteResponseSchema.parse({
        deleted: { version: '1.0.0', rowsRemoved: -1, freedBytes: 0, dirDeleted: false },
        versions: { versions: [], versioningAvailable: false, totalBytes: 0 },
      }),
    ).toThrow();
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
