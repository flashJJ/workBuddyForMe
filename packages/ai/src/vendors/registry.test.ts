import { describe, expect, it } from 'vitest';
import {
  findVendorByBaseUrl,
  getVendor,
  listVendors,
  normalizeBaseUrl,
  resolveVendorDiscovery,
} from './registry';

describe('vendor registry', () => {
  it('按 id 查找厂商描述', () => {
    expect(getVendor('deepseek')?.name).toBe('DeepSeek');
    expect(getVendor('volcengine-agent-plan')?.keyScope).toBe('plan');
    expect(getVendor('volcengine-coding-plan')?.keyScope).toBe('coding');
    expect(getVendor('missing')).toBeNull();
    expect(getVendor(null)).toBeNull();
  });

  it('按 Base URL 匹配，忽略尾部斜杠与大小写', () => {
    expect(findVendorByBaseUrl('https://api.deepseek.com/v1/')?.id).toBe('deepseek');
    expect(findVendorByBaseUrl(' HTTPS://ARK.CN-BEIJING.VOLCES.COM/API/PLAN/V3 ')?.id).toBe(
      'volcengine-agent-plan',
    );
    expect(findVendorByBaseUrl('https://unknown.example/v1')).toBeNull();
    expect(findVendorByBaseUrl(null)).toBeNull();
  });

  it('缺省发现策略为 openai-models，manual-only 按描述返回', () => {
    expect(resolveVendorDiscovery(getVendor('deepseek'))).toBe('openai-models');
    expect(resolveVendorDiscovery(getVendor('volcengine-ark'))).toBe('openai-models');
    expect(resolveVendorDiscovery(getVendor('volcengine-agent-plan'))).toBe('manual-only');
    expect(resolveVendorDiscovery(null)).toBe('openai-models');
  });

  it('描述列表与 UI 预设保持同一份数据', () => {
    expect(listVendors().length).toBeGreaterThanOrEqual(10);
    expect(normalizeBaseUrl(' https://x/v1/// ')).toBe('https://x/v1');
  });
});
