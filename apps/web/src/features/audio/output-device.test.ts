import { describe, expect, it, vi } from 'vitest';
import { applySinkId, normalizeOutputDevice } from './output-device';

function target(setSinkId: (deviceId: string) => Promise<void>) {
  return { setSinkId };
}

describe('applySinkId（v4.3 M4）', () => {
  it('支持时应用指定设备', async () => {
    const setSinkId = vi.fn(async () => undefined);
    await expect(applySinkId(target(setSinkId), 'speaker-1')).resolves.toBe('applied');
    expect(setSinkId).toHaveBeenCalledWith('speaker-1');
  });

  it('设备消失/权限变化时回退系统默认', async () => {
    const setSinkId = vi
      .fn(async (_deviceId: string) => undefined)
      .mockRejectedValueOnce(new Error('device gone'))
      .mockResolvedValueOnce(undefined);
    await expect(applySinkId(target(setSinkId), 'gone')).resolves.toBe('fallback');
    expect(setSinkId.mock.calls.map((call) => call[0])).toEqual(['gone', '']);
  });

  it('完全不支持或无目标时返回 unsupported', async () => {
    const setSinkId = vi.fn(async () => undefined);
    await expect(applySinkId(null, 'speaker-1')).resolves.toBe('unsupported');
    await expect(applySinkId({}, 'speaker-1')).resolves.toBe('unsupported');
    expect(setSinkId).not.toHaveBeenCalled();
  });

  it('空白设备归一化为默认', () => {
    expect(normalizeOutputDevice('  ')).toBeNull();
    expect(normalizeOutputDevice('')).toBeNull();
    expect(normalizeOutputDevice(' speaker-1 ')).toBe('speaker-1');
  });
});
