// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { AppSidebar } from './app-sidebar';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { renderWithProviders } from '@/test/render';
import ChatPage from '@/app/(main)/chat/page';
import KnowledgePage from '@/app/(main)/knowledge/page';
import AssistantsPage from '@/app/(main)/assistants/page';
import SettingsPage from '@/app/(main)/settings/page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const usePathname = vi.fn(() => '/chat');
vi.mock('next/navigation', () => ({ usePathname: () => usePathname(), useRouter: () => ({}) }));

function Bomb({ message }: { message: string }): React.ReactElement {
  throw new Error(message);
}

describe('应用外壳（TR-23.1）', () => {
  beforeEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('侧边栏：四个模块导航，当前路由高亮，切换路径更新高亮', () => {
    const { rerender } = render(
      <ThemeProvider>
        <AppSidebar />
      </ThemeProvider>,
    );
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /对话/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    usePathname.mockReturnValue('/knowledge');
    rerender(
      <ThemeProvider>
        <AppSidebar />
      </ThemeProvider>,
    );
    expect(screen.getByRole('link', { name: /知识库/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('主题切换：点击后 html 挂 dark 类并可切回', () => {
    render(
      <ThemeProvider>
        <AppSidebar />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole('button', { name: /切换到深色模式/ });
    fireEvent.click(toggle);
    expect(document.documentElement).toHaveClass('dark');
    fireEvent.click(screen.getByRole('button', { name: /切换到浅色模式/ }));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('错误边界：子组件抛错时渲染兜底，点击重试后恢复', () => {
    function RecoverableApp() {
      const [ok, setOk] = React.useState(false);
      return (
        <ErrorBoundary onReset={() => setOk(true)}>
          {ok ? <p>恢复正常</p> : <Bomb message="组件炸了" />}
        </ErrorBoundary>
      );
    }
    render(<RecoverableApp />);
    expect(screen.getByText('页面出了点问题')).toBeInTheDocument();
    expect(screen.getByText(/组件炸了/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(screen.getByText('恢复正常')).toBeInTheDocument();
  });

  it('四个模块页面均可挂载无报错', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify({
          success: true,
          data:
            url === '/api/settings'
              ? { defaultChatModelId: null, defaultEmbeddingModelId: null, theme: 'light', language: 'zh-CN' }
              : url === '/api/system/info'
                ? { dataDir: '/tmp/wbfm' }
                : [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pages = [ChatPage, KnowledgePage, AssistantsPage, SettingsPage];
    for (const Page of pages) {
      const { unmount } = renderWithProviders(<Page />);
      expect(screen.queryByText('页面出了点问题')).toBeNull();
      if (Page === SettingsPage) {
        expect(await screen.findByRole('button', { name: '新增供应商' })).toBeInTheDocument();
      }
      unmount();
    }
  });
});
