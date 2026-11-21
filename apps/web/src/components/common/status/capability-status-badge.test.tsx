// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { CapabilityStatusBadge } from './capability-status-badge';

describe('CapabilityStatusBadge（v4.17）', () => {
  it.each([
    ['available', '可用'],
    ['enabled', '已启用'],
    ['disabled', '已停用'],
    ['error', '异常'],
  ] as const)('%s 状态语义唯一', (status, label) => {
    render(
      <I18nProvider skipHydration>
        <CapabilityStatusBadge status={status} />
      </I18nProvider>,
    );
    const badge = screen.getByTestId('capability-status');
    expect(badge).toHaveAttribute('data-status', status);
    expect(badge).toHaveTextContent(label);
  });
});
