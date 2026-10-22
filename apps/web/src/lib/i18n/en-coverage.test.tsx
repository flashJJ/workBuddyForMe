// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/common/toast';
import { ConfirmProvider } from '@/components/common/confirm-dialog';
import { I18nProvider } from './i18n-context';
import { P1_ALLOWED_MISSING_PREFIXES } from './p1-domains';
import ChatPage from '@/app/(main)/chat/page';
import TasksPage from '@/app/(main)/tasks/page';
// v2.5：Next 15 路由页为 async Server Component，客户端严格模式测试改用 feature 组件。
import { KnowledgePage } from '@/features/knowledge/knowledge-page';
import { AssistantsPage } from '@/features/assistants/assistants-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { FlowsListPage } from '@/features/flows/flows-list-page';
import { ConfigPanel } from '@/features/flow-editor/config-panel';
import type { FlowCanvasNode } from '@/features/flow-editor/graph-utils';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'content-type': 'application/json' },
  });
}

function renderEnStrict(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider skipHydration>
        <I18nProvider
          skipHydration
          initialLocale="en-US"
          strictMissingKeys
          allowedMissingPrefixes={[...P1_ALLOWED_MISSING_PREFIXES]}
        >
          <ToastProvider>
            <ConfirmProvider>{ui}</ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('英文态 P0 覆盖（strict 缺键即失败）', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (url: string) => {
      const data =
        url === '/api/settings'
          ? { defaultChatModelId: null, defaultEmbeddingModelId: null, theme: 'light', language: 'en-US', hasOnboarded: true }
          : url === '/api/system/info'
            ? { dataDir: '/tmp/wbfm' }
            : [];
      return ok(data);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  const pages: Array<{ name: string; el: React.ReactElement }> = [
    { name: 'chat', el: <ChatPage /> },
    { name: 'knowledge', el: <KnowledgePage /> },
    { name: 'assistants', el: <AssistantsPage /> },
    { name: 'settings', el: <SettingsPage /> },
    { name: 'tasks', el: <TasksPage /> },
    { name: 'flows', el: <FlowsListPage /> },
  ];

  for (const page of pages) {
    it(`${page.name} 页英文态挂载无错误边界（strict 缺键会在渲染期直接抛出）`, async () => {
      renderEnStrict(page.el);
      // 错误边界兜底标题（en）不允许出现；strict 模式下任何 en 缺键会在渲染期 throw
      await vi.waitFor(() =>
        expect(screen.queryByText('Something went wrong')).toBeNull(),
      );
    });
  }

  it('flow 画布 agent 配置面板英文态挂载无缺键（goal/工具域/预算/角色模型表单）', async () => {
    const agentNode = {
      id: 'agent_1',
      type: 'agent',
      position: { x: 0, y: 0 },
      data: { config: { goal: 'g', toolScopes: ['knowledge', 'desktop'] } },
    } as unknown as FlowCanvasNode;
    renderEnStrict(
      <ConfigPanel
        node={agentNode}
        nodes={[agentNode]}
        onChangeConfig={() => undefined}
        onDelete={() => undefined}
        onClose={() => undefined}
      />,
    );
    await vi.waitFor(() =>
      expect(screen.queryByText('Something went wrong')).toBeNull(),
    );
    // 关键英文文案存在（strict 下缺键会直接 throw，此处再锁定可见标签）
    expect(screen.getByText('Collaboration goal')).toBeInTheDocument();
    expect(screen.getByText('Desktop control (vision)')).toBeInTheDocument();
  });
});
