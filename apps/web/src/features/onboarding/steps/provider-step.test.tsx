// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ProviderStep } from './provider-step';

const { probeMock } = vi.hoisted(() => ({ probeMock: vi.fn() }));
vi.mock('@/lib/hooks/use-ollama-probe', () => ({ useOllamaProbe: probeMock }));

/** 供应商查询走真实 hook：stub 空列表响应即可 */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

describe('向导第 2 步来源置顶（v2.4 M1）', () => {
  beforeEach(() => {
    stubFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const tabIds = () =>
    within(screen.getByRole('tablist'))
      .getAllByRole('tab')
      .map((tab) => tab.getAttribute('data-testid'));

  it('未探测到本机 Ollama：演示模式置顶且默认选中', () => {
    probeMock.mockReturnValue({ data: { available: false } });
    renderWithProviders(<ProviderStep />);

    expect(tabIds()).toEqual(['ob-tab-demo', 'ob-tab-ollama', 'ob-tab-cloud']);
    expect(screen.getByTestId('ob-tab-demo')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('onboarding-demo')).toBeInTheDocument();
  });

  it('探测到本机 Ollama：本地来源置顶并默认选中', async () => {
    probeMock.mockReturnValue({ data: { available: true } });
    renderWithProviders(<ProviderStep />);

    expect(tabIds()).toEqual(['ob-tab-ollama', 'ob-tab-demo', 'ob-tab-cloud']);
    await waitFor(() =>
      expect(screen.getByTestId('ob-tab-ollama')).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByTestId('onboarding-ollama')).toBeInTheDocument();
  });

  it('探测结果迟到时不抢占已手动切换的页签', async () => {
    probeMock.mockReturnValue({ data: undefined });
    const { rerender } = renderWithProviders(<ProviderStep />);
    // 用户先手动切到云端，探测随后命中
    screen.getByTestId('ob-tab-cloud').click();
    probeMock.mockReturnValue({ data: { available: true } });
    rerender(<ProviderStep />);

    await waitFor(() => expect(screen.getByTestId('onboarding-cloud')).toBeInTheDocument());
    expect(screen.getByTestId('ob-tab-cloud')).toHaveAttribute('aria-selected', 'true');
  });
});
