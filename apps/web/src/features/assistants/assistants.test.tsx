// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Assistant } from '@wbfm/shared';
import { renderWithProviders } from '@/test/render';
import { AssistantsPage } from './assistants-page';

function makeAssistant(partial: Partial<Assistant> & { id: string; name: string }): Assistant {
  return {
    emoji: '🤖',
    color: '#6366f1',
    systemPrompt: '',
    temperature: 1,
    topP: 1,
    maxTokens: null,
    modelId: null,
    knowledgeBaseId: null,
    enabledTools: [],
    retrieveAlways: false,
    isBuiltin: false,
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...partial,
  };
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('助手管理（TR-26.1）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('新建助手：自定义 temperature 随表单提交', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/assistants' && init?.method === 'POST') return ok({ id: 'a9' });
      if (url === '/api/assistants') return ok([]);
      return ok([]);
    });
    const user = userEvent.setup();
    renderWithProviders(<AssistantsPage />);

    await user.click(await screen.findByRole('button', { name: '新建助手' }));
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '代码评审员');
    await user.clear(screen.getByLabelText(/Temperature/));
    await user.type(screen.getByLabelText(/Temperature/), '0.7');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/assistants', expect.anything()),
    );
    const postCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/assistants' && (call[1] as RequestInit).method === 'POST',
    );
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({ name: '代码评审员', temperature: 0.7, topP: 1 });
  });

  it('内置助手无删除入口，自定义助手可删除（含确认）', async () => {
    const builtin = makeAssistant({ id: 'a1', name: '通用助手', isBuiltin: true });
    const custom = makeAssistant({ id: 'a2', name: '翻译官' });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/assistants') return ok([builtin, custom]);
      if (url.startsWith('/api/assistants/a2')) return ok({ id: 'a2' });
      return ok([]);
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<AssistantsPage />);

    const builtinCard = await screen.findByTestId('assistant-card-a1');
    expect(within(builtinCard).queryByRole('button', { name: '删除' })).toBeNull();
    expect(within(builtinCard).getByText('内置')).toBeInTheDocument();

    await user.click(within(screen.getByTestId('assistant-card-a2')).getByRole('button', { name: '删除' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/assistants/a2', expect.anything()),
    );
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('排序：首个助手下移后提交完整 orderedIds', async () => {
    const a1 = makeAssistant({ id: 'a1', name: '助手一' });
    const a2 = makeAssistant({ id: 'a2', name: '助手二' });
    fetchMock.mockImplementation(async (url: string, _init?: RequestInit) => {
      if (url === '/api/assistants/reorder') return ok({ orderedIds: ['a2', 'a1'] });
      if (url === '/api/assistants') return ok([a1, a2]);
      return ok([]);
    });
    const user = userEvent.setup();
    renderWithProviders(<AssistantsPage />);

    await user.click(await screen.findByRole('button', { name: '助手一 下移' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/assistants/reorder', expect.anything()),
    );
    const call = fetchMock.mock.calls.find((item) => item[0] === '/api/assistants/reorder');
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      orderedIds: ['a2', 'a1'],
    });
  });
});
