import { describe, expect, it } from 'vitest';
import {
  PROVIDER_CAPABILITY_KEYS,
  PROVIDER_PROTOCOL_CAPABILITIES,
  PROVIDER_PROTOCOLS,
} from '../../constants';

describe('provider 能力元数据（v4.3 M5）', () => {
  it('每个协议都有完整的只读能力声明', () => {
    for (const protocol of PROVIDER_PROTOCOLS) {
      const capabilities = PROVIDER_PROTOCOL_CAPABILITIES[protocol];
      for (const key of PROVIDER_CAPABILITY_KEYS) {
        expect(typeof capabilities[key]).toBe('boolean');
      }
    }
  });

  it('流式与工具调用是当前协议的共同基础能力', () => {
    for (const protocol of PROVIDER_PROTOCOLS) {
      expect(PROVIDER_PROTOCOL_CAPABILITIES[protocol].stream).toBe(true);
      expect(PROVIDER_PROTOCOL_CAPABILITIES[protocol].tools).toBe(true);
    }
  });
});
