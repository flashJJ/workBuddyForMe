// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { LimitHint } from './limit-hint';

function renderHint(current: number, limit: number) {
  return render(
    <I18nProvider skipHydration>
      <LimitHint current={current} limit={limit} />
    </I18nProvider>,
  );
}

describe('LimitHint（v4.17）', () => {
  it('未达上限时提示剩余可选数量', () => {
    renderHint(3, 10);
    expect(screen.getByTestId('limit-hint')).toHaveAttribute('data-reached', 'false');
    expect(screen.getByTestId('limit-hint')).toHaveTextContent('7');
  });

  it('达上限时明确告知上限，禁止静默截断', () => {
    renderHint(10, 10);
    expect(screen.getByTestId('limit-hint')).toHaveAttribute('data-reached', 'true');
    expect(screen.getByTestId('limit-hint')).toHaveTextContent('10');
  });
});
