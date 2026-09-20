import { describe, expect, it } from 'vitest';
import { renderCipherBootstrap } from './cipher-bootstrap';

describe('renderCipherBootstrap 引导脚本', () => {
  it('暴露同步 __WBFM_CIPHER__，内含 worker/Atomics 与端点配置', () => {
    const source = renderCipherBootstrap({ url: 'http://127.0.0.1:53000', token: 'abc123' });
    expect(source).toContain('globalThis.__WBFM_CIPHER__');
    expect(source).toContain('encrypt:');
    expect(source).toContain('decrypt:');
    expect(source).toContain("require('node:worker_threads')");
    expect(source).toContain('Atomics.wait');
    expect(source).toContain('/encrypt');
    expect(source).toContain('/decrypt');
    expect(source).toContain('http://127.0.0.1:53000');
    expect(source).toContain('abc123');
  });
});
