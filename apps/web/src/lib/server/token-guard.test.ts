import { describe, expect, it } from 'vitest';
import { assertToken } from './token-guard';

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/providers', { headers });
}

describe('token-guard（TR-30.1）', () => {
  it('非托管模式（WBFM_SERVER_MANAGED≠1）放行任意请求', () => {
    const previous = process.env.WBFM_SERVER_MANAGED;
    delete process.env.WBFM_SERVER_MANAGED;
    delete process.env.WBFM_TOKEN;
    try {
      expect(() => assertToken(makeRequest({}))).not.toThrow();
    } finally {
      if (previous !== undefined) process.env.WBFM_SERVER_MANAGED = previous;
    }
  });

  it('托管模式：无 token / 错误 token 抛 UNAUTHORIZED', () => {
    process.env.WBFM_SERVER_MANAGED = '1';
    process.env.WBFM_TOKEN = 'secret';
    try {
      expect(() => assertToken(makeRequest({}))).toThrowError(/访问令牌/);
      expect(() => assertToken(makeRequest({ 'x-wbfm-token': 'wrong' }))).toThrowError(/访问令牌/);
    } finally {
      delete process.env.WBFM_SERVER_MANAGED;
      delete process.env.WBFM_TOKEN;
    }
  });

  it('托管模式：正确 token 放行；服务端缺令牌配置时拒绝', () => {
    process.env.WBFM_SERVER_MANAGED = '1';
    try {
      delete process.env.WBFM_TOKEN;
      expect(() => assertToken(makeRequest({ 'x-wbfm-token': 'secret' }))).toThrowError(/未配置访问令牌/);
      process.env.WBFM_TOKEN = 'secret';
      expect(() => assertToken(makeRequest({ 'x-wbfm-token': 'secret' }))).not.toThrow();
    } finally {
      delete process.env.WBFM_SERVER_MANAGED;
      delete process.env.WBFM_TOKEN;
    }
  });
});
