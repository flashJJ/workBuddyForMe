// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  enUS,
  PLURAL_RULES,
  zhCN,
  type MessageNode,
} from '@wbfm/shared/i18n';
import { ApiClientError } from '@/lib/api/client';
import { errorText, resolveError } from './resolve-error';

const zh = createTranslator(zhCN as MessageNode, { pluralRule: PLURAL_RULES['zh-CN'] });
const en = createTranslator(enUS as MessageNode, {
  fallbackDict: zhCN as MessageNode,
  pluralRule: PLURAL_RULES['en-US'],
});

describe('resolveError / errorText（T4.4 错误码本地化）', () => {
  it('已知错误码：code 映射到 errors 字典，服务端 message 降为 detail', () => {
    const r = resolveError(
      new ApiClientError('VALIDATION_ERROR', '服务端中文细节：名称不能为空', 422),
      zh,
    );
    expect(r.kind).toBe('VALIDATION_ERROR');
    expect(r.message).toBe('提交的数据校验失败，请检查输入内容。');
    expect(r.detail).toContain('名称不能为空');
  });

  it('8 个高频错误码中英映射全部可读且非键裸露', () => {
    const codes = [
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'EMBEDDING_NOT_CONFIGURED',
      'PROVIDER_ERROR',
      'PROVIDER_TIMEOUT',
      'INTERNAL_ERROR',
      'NETWORK_ERROR',
      'UNKNOWN_ERROR',
    ] as const;
    for (const code of codes) {
      for (const t of [zh, en]) {
        const msg = t(`errors.${code}`);
        expect(msg).toBeTruthy();
        expect(msg).not.toContain('errors.');
      }
    }
  });

  it('未知错误码降级 UNKNOWN_ERROR，服务端细节保留在 detail', () => {
    const r = resolveError(new ApiClientError('WEIRD_NEW_CODE', 'boom', 500), zh);
    expect(r.kind).toBe('UNKNOWN_ERROR');
    expect(r.message).toBe('发生未知错误，请稍后重试。');
    expect(r.detail).toBe('boom');
  });

  it('TypeError（断网 fetch 失败）→ NETWORK_ERROR，中英各自文案', () => {
    expect(resolveError(new TypeError('Failed to fetch'), zh).kind).toBe('NETWORK_ERROR');
    expect(errorText(new TypeError('Failed to fetch'), zh)).toBe(
      '网络连接失败，请检查网络后重试。',
    );
    expect(errorText(new TypeError('Failed to fetch'), en)).toBe(
      'Network error. Check your connection and try again.',
    );
  });

  it('普通 Error：UNKNOWN_ERROR；errorText 可用业务兜底键', () => {
    const err = new Error('本地崩溃');
    expect(resolveError(err, zh).kind).toBe('UNKNOWN_ERROR');
    expect(errorText(err, zh, { fallback: 'assistants.deleteFailed' })).toBe('删除失败');
    expect(errorText(err, zh)).toBe('发生未知错误，请稍后重试。');
  });

  it('英文态：已知 code 出英文文案，不回退中文', () => {
    const out = errorText(
      new ApiClientError('UNAUTHORIZED', 'invalid key', 401),
      en,
    );
    expect(out).toBe('Unauthorized or invalid API key.');
  });

  it('withDetail：主文案后按语言习惯附加细节', () => {
    const err = new ApiClientError('PROVIDER_ERROR', '鉴权失败 401', 502);
    expect(errorText(err, zh, { withDetail: true })).toBe(
      '模型服务返回错误，请检查供应商配置或稍后重试。（鉴权失败 401）',
    );
    expect(errorText(err, en, { withDetail: true })).toBe(
      'The model service returned an error. Check your provider settings or try again later. (鉴权失败 401)',
    );
  });

  it('非 Error 值：UNKNOWN_ERROR 且无 detail 崩溃', () => {
    const r = resolveError('字符串异常', zh);
    expect(r.kind).toBe('UNKNOWN_ERROR');
    expect(r.detail).toBeUndefined();
  });
});
