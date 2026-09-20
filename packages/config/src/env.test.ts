import { describe, expect, it } from 'vitest';
import { assertManagedToken, readEnv } from './env';

describe('readEnv', () => {
  it('缺省值：开发模式、回环地址、非托管', () => {
    const env = readEnv({});
    expect(env).toMatchObject({
      nodeEnv: 'development',
      isProduction: false,
      isManagedServer: false,
      hostname: '127.0.0.1',
    });
    expect(env.port).toBeUndefined();
    expect(env.token).toBeUndefined();
  });

  it('解析生产/托管/端口/令牌', () => {
    const env = readEnv({
      NODE_ENV: 'production',
      WBFM_SERVER_MANAGED: '1',
      WBFM_TOKEN: 'secret',
      PORT: '45123',
      HOSTNAME: '127.0.0.1',
    });
    expect(env.isProduction).toBe(true);
    expect(env.isManagedServer).toBe(true);
    expect(env.token).toBe('secret');
    expect(env.port).toBe(45123);
  });

  it('非法端口返回 undefined', () => {
    expect(readEnv({ PORT: 'abc' }).port).toBeUndefined();
    expect(readEnv({ PORT: '0' }).port).toBeUndefined();
  });

  it('托管但缺少令牌时 assertManagedToken 抛错', () => {
    expect(() => assertManagedToken(readEnv({ WBFM_SERVER_MANAGED: '1' }))).toThrow(
      /WBFM_TOKEN/,
    );
  });

  it('非托管返回空令牌串', () => {
    expect(assertManagedToken(readEnv({}))).toBe('');
  });
});
