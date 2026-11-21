// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Message } from '@wbfm/shared/types';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { MessageError } from './message-error';

const message = {
  id: 'm1',
  conversationId: 'c1',
  role: 'assistant',
  content: '',
  status: 'error',
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  citations: [],
  toolTrace: [],
  contentParts: [],
  feedback: null,
  feedbackAt: null,
  errorCode: 'rate_limited',
  errorMessage: '上游限流',
  createdAt: '2026-11-22T00:00:00.000Z',
} as Message;

describe('v4.18 错误态三动作', () => {
  it('重试 / 换备用模型 / 保留输入都可点击', () => {
    const retry = vi.fn();
    const fallback = vi.fn();
    const restore = vi.fn();
    render(
      <I18nProvider skipHydration>
        <MessageError
          message={message}
          onRetry={retry}
          onRetryWithFallback={fallback}
          onRestoreInput={restore}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    fireEvent.click(screen.getByRole('button', { name: '换备用模型' }));
    fireEvent.click(screen.getByRole('button', { name: '保留输入' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
