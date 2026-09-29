import { describe, expect, it } from 'vitest';
import {
  COMPUTER_CHANNEL_FILE,
  SCREENSHOT_MAX_EDGE,
  computerChannelInfoSchema,
  screenSnapshotArgsSchema,
} from '../index';

describe('computer schemas（v0.7 M1 屏幕感知）', () => {
  it('常量值稳定', () => {
    expect(COMPUTER_CHANNEL_FILE).toBe('computer-channel.json');
    expect(SCREENSHOT_MAX_EDGE).toBe(1568);
  });

  it('scope 默认 fullscreen，region 可缺省', () => {
    const parsed = screenSnapshotArgsSchema.parse({});
    expect(parsed.scope).toBe('fullscreen');
    expect(parsed.region).toBeUndefined();
    // fullscreen 显式携带 region 也允许（desktop 侧忽略）
    expect(
      screenSnapshotArgsSchema.safeParse({ scope: 'fullscreen', region: { x: 0, y: 0, width: 100, height: 100 } })
        .success,
    ).toBe(true);
  });

  it('scope=region 必须带 region，且坐标/尺寸合法', () => {
    expect(screenSnapshotArgsSchema.safeParse({ scope: 'region' }).success).toBe(false);
    expect(
      screenSnapshotArgsSchema.safeParse({ scope: 'region', region: { x: -1, y: 0, width: 10, height: 10 } })
        .success,
    ).toBe(false);
    expect(
      screenSnapshotArgsSchema.safeParse({ scope: 'region', region: { x: 0, y: 0, width: 0, height: 10 } })
        .success,
    ).toBe(false);
    expect(
      screenSnapshotArgsSchema.safeParse({ scope: 'region', region: { x: 0, y: 0, width: 10.5, height: 10 } })
        .success,
    ).toBe(false);
    const ok = screenSnapshotArgsSchema.parse({ scope: 'region', region: { x: 10, y: 20, width: 300, height: 200 } });
    expect(ok.region).toEqual({ x: 10, y: 20, width: 300, height: 200 });
  });

  it('未知 scope 被拒', () => {
    expect(screenSnapshotArgsSchema.safeParse({ scope: 'window' }).success).toBe(false);
  });

  it('通道发现文件契约校验', () => {
    const info = {
      version: 1,
      url: 'http://127.0.0.1:51234',
      token: 'abc123',
      pid: 4321,
      startedAt: new Date().toISOString(),
    };
    expect(computerChannelInfoSchema.safeParse(info).success).toBe(true);
    expect(computerChannelInfoSchema.safeParse({ ...info, version: 2 }).success).toBe(false);
    expect(computerChannelInfoSchema.safeParse({ ...info, token: '' }).success).toBe(false);
    expect(computerChannelInfoSchema.safeParse({ ...info, url: 'not-a-url' }).success).toBe(false);
    expect(computerChannelInfoSchema.safeParse({ ...info, pid: 0 }).success).toBe(false);
  });
});
