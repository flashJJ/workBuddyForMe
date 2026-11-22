import { describe, expect, it } from 'vitest';
import { generateEdgeSecMsGec } from './edge-tts-token';

describe('generateEdgeSecMsGec（微软 Edge 朗读 DRM 令牌）', () => {
  it('固定时间戳输出稳定令牌', () => {
    expect(generateEdgeSecMsGec(1_700_000_000_000)).toBe(
      '2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2',
    );
  });

  it('同一 5 分钟窗口内令牌一致，跨窗口变化', () => {
    const bucketStart = generateEdgeSecMsGec(1_699_999_800_000);
    expect(generateEdgeSecMsGec(1_700_000_000_000)).toBe(bucketStart);
    expect(generateEdgeSecMsGec(1_700_000_100_000)).not.toBe(bucketStart);
  });

  it('格式为 16-64 位大写十六进制', () => {
    expect(generateEdgeSecMsGec()).toMatch(/^[0-9A-F]{16}-[0-9A-F]{64}$/);
  });
});
