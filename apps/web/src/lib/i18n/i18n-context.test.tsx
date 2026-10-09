// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, LANGUAGE_STORAGE_KEY, useI18n } from './i18n-context';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'content-type': 'application/json' },
  });
}

function Probe({ missingKey }: { missingKey?: string }) {
  const { locale, t, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="save">{t('common.actions.save')}</span>
      <span data-testid="nav">{t('nav.chat.label')}</span>
      {missingKey ? <span data-testid="missing">{t(missingKey as never)}</span> : null}
      <button type="button" onClick={() => setLocale('en-US')}>
        en
      </button>
      <button type="button" onClick={() => setLocale('zh-CN')}>
        zh
      </button>
    </div>
  );
}

class ErrBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return <div data-testid="boundary">{this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

describe('I18nProvider（v1.2 M4）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    document.documentElement.lang = '';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('默认 zh-CN：渲染中文并同步 <html lang>', () => {
    render(
      <I18nProvider skipHydration>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('save').textContent).toBe('保存');
    expect(screen.getByTestId('nav').textContent).toBe('对话');
    expect(screen.getByTestId('locale').textContent).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('initialLocale=en-US：渲染英文', () => {
    render(
      <I18nProvider skipHydration initialLocale="en-US">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('save').textContent).toBe('Save');
    expect(screen.getByTestId('nav').textContent).toBe('Chat');
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('切换英文即时生效（不刷新），html lang/localStorage/PUT 同步', async () => {
    // 注意：必须每次返回新 Response，复用实例第二次 .json() 会因 body 已消费而失败
    fetchMock.mockImplementation(async () => ok({}));
    const user = userEvent.setup();
    render(
      <I18nProvider skipHydration>
        <Probe />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'en' }));

    await waitFor(() =>
      expect(screen.getByTestId('save').textContent).toBe('Save'),
    );
    expect(screen.getByTestId('nav').textContent).toBe('Chat');
    expect(document.documentElement.lang).toBe('en-US');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-US');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/settings'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ language: 'en-US' }),
      }),
    );

    // 切回中文
    await user.click(screen.getByRole('button', { name: 'zh' }));
    await waitFor(() => expect(screen.getByTestId('save').textContent).toBe('保存'));
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('水合：服务端设置为真源校正 localStorage 语言', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh-CN');
    fetchMock.mockResolvedValue(ok({ language: 'en-US' }));
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('save').textContent).toBe('保存');
    await waitFor(() => expect(screen.getByTestId('save').textContent).toBe('Save'));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-US');
  });

  it('非 strict 缺键：保底渲染 key 本身并 console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <I18nProvider skipHydration initialLocale="en-US">
        <Probe missingKey="unknownModule.futureKey" />
      </I18nProvider>,
    );
    expect(screen.getByTestId('missing').textContent).toBe('unknownModule.futureKey');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unknownModule.futureKey'),
    );
    warn.mockRestore();
  });

  it('strict 模式：英文态缺键即抛错（ErrorBoundary 可见）', () => {
    render(
      <I18nProvider skipHydration initialLocale="en-US" strictMissingKeys>
        <ErrBoundary>
          <Probe missingKey="unknownModule.futureKey" />
        </ErrBoundary>
      </I18nProvider>,
    );
    expect(screen.getByTestId('boundary').textContent).toContain('unknownModule.futureKey');
  });

  it('strict 模式：豁免前缀的缺键不抛错，回退返回 key 本身', () => {
    render(
      <I18nProvider
        skipHydration
        initialLocale="en-US"
        strictMissingKeys
        allowedMissingPrefixes={['p1Panel']}
      >
        <Probe missingKey="p1Panel.deep.key" />
      </I18nProvider>,
    );
    expect(screen.getByTestId('missing').textContent).toBe('p1Panel.deep.key');
  });

  it('中文态（默认语言）t 永不缺键：strict 下核心键正常', () => {
    render(
      <I18nProvider skipHydration strictMissingKeys>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('save').textContent).toBe('保存');
    expect(screen.getByTestId('nav').textContent).toBe('对话');
  });
});
