// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppSettings, Assistant, Provider, ProviderModel } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { TuningPanel } from './tuning-panel';

const PROVIDER: Provider = {
  id: 'p1',
  name: 'P',
  protocol: 'openai-compatible',
  baseUrl: 'https://x/v1',
  apiKeyMasked: null,
  enabled: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const MODELS: ProviderModel[] = [
  { id: 'm-chat', providerId: 'p1', modelId: 'mock-chat', displayName: 'Mock Chat', capabilities: ['chat'], contextWindow: 32000, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'm-small', providerId: 'p1', modelId: 'small-chat', displayName: 'Small Chat', capabilities: ['chat'], contextWindow: 4096, createdAt: '2026-01-01T00:00:00.000Z' },
];

const ASSISTANT: Assistant = {
  id: 'a1',
  name: '调优助手',
  emoji: '🤖',
  color: null,
  systemPrompt: '',
  temperature: 1,
  topP: 1,
  maxTokens: null,
  modelId: null,
  plannerModelId: null,
  executorModelId: null,
  reviewerModelId: null,
  knowledgeBaseIds: [],
  enabledTools: [],
  retrieveAlways: true,
  memoryEnabled: true,
  expressionEnabled: true,
  personalityFrankness: 0.5,
  personalityTsundere: 0.2,
  personalityShy: 0.1,
  personalityTolerance: 0.9,
  cardId: null,
  isBuiltin: false,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SETTINGS: AppSettings = {
  defaultChatModelId: 'm-chat',
  defaultEmbeddingModelId: null,
  theme: 'light',
  language: 'zh-CN',
  hasOnboarded: true,
  contextMessageCount: 20,
  globalAppendPrompt: '',
  globalAppendPromptEnabled: false,
};

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'content-type': 'application/json' },
  });
}

describe('v1.8 M3 调优中心', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((input: string) => {
      if (input.includes('/api/providers/') && input.includes('/models')) return Promise.resolve(ok(MODELS));
      if (input === '/api/providers') return Promise.resolve(ok([PROVIDER]));
      if (input === '/api/assistants') return Promise.resolve(ok([ASSISTANT]));
      if (input === '/api/settings') return Promise.resolve(ok(SETTINGS));
      return Promise.resolve(ok({}));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('矩阵五行齐全：聊天/三角色可选可改，记忆只读跟随默认', async () => {
    renderWithProviders(<TuningPanel />);
    const matrix = await screen.findByTestId('tuning-model-matrix');

    expect(within(matrix).getByTestId('tuning-model-chat')).toBeInTheDocument();
    expect(within(matrix).getByTestId('tuning-model-planner')).toBeInTheDocument();
    expect(within(matrix).getByTestId('tuning-model-executor')).toBeInTheDocument();
    expect(within(matrix).getByTestId('tuning-model-reviewer')).toBeInTheDocument();
    expect(within(matrix).getByTestId('tuning-model-memory').textContent).toContain('Mock Chat');
    // 大模型无弱模型提示
    expect(screen.queryByTestId('tuning-weak-hint')).toBeNull();
  });

  it('Planner 改绑落 assistant PATCH；默认模型为小模型时出现弱模型提示', async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input.includes('/api/providers/') && input.includes('/models')) return Promise.resolve(ok(MODELS));
      if (input === '/api/providers') return Promise.resolve(ok([PROVIDER]));
      if (input === '/api/assistants') return Promise.resolve(ok([{ ...ASSISTANT, modelId: 'm-small' }]));
      if (input === '/api/settings') return Promise.resolve(ok({ ...SETTINGS, defaultChatModelId: 'm-small' }));
      return Promise.resolve(ok({ ...ASSISTANT, modelId: 'm-small' }));
    });
    renderWithProviders(<TuningPanel />);
    await screen.findByTestId('tuning-model-matrix');
    expect(screen.getByTestId('tuning-weak-hint').textContent).toContain('小模型');

    // Radix Select 在 jsdom 下无法由 user-event 驱动，改用键盘打开 + 点击选项
    fireEvent.keyDown(screen.getByTestId('tuning-model-planner'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: /Mock Chat/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/assistants/a1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const patchCall = fetchMock.mock.calls.find(
      (c) => c[0] === '/api/assistants/a1' && (c[1] as RequestInit).method === 'PATCH',
    )!;
    expect(JSON.parse((patchCall[1] as RequestInit).body as string)).toMatchObject({
      plannerModelId: 'm-chat',
    });
  });

  it('全局追加：开关 PUT 落库，开启后文本框可编辑并在失焦时保存', async () => {
    const user = userEvent.setup();
    const settingsState = { ...SETTINGS };
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input.includes('/api/providers/') && input.includes('/models')) return Promise.resolve(ok(MODELS));
      if (input === '/api/providers') return Promise.resolve(ok([PROVIDER]));
      if (input === '/api/assistants') return Promise.resolve(ok([ASSISTANT]));
      if (input === '/api/settings') {
        if (init?.method === 'PUT') Object.assign(settingsState, JSON.parse(init.body as string));
        return Promise.resolve(ok(settingsState));
      }
      return Promise.resolve(ok({}));
    });
    renderWithProviders(<TuningPanel />);
    await screen.findByTestId('tuning-model-matrix');

    const checkbox = screen.getByTestId('tuning-append-enabled') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    const textbox = screen.getByTestId('tuning-append-text') as HTMLTextAreaElement;
    expect(textbox.disabled).toBe(true);

    await user.click(checkbox);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/settings', expect.objectContaining({ method: 'PUT' })),
    );
    expect(textbox.disabled).toBe(false);

    await user.type(textbox, '始终用中文');
    textbox.blur();
    await waitFor(() => {
      const settingsPuts = fetchMock.mock.calls.filter(
        (c) => c[0] === '/api/settings' && (c[1] as RequestInit).method === 'PUT',
      );
      const bodies = settingsPuts.map((c) => JSON.parse((c[1] as RequestInit).body as string));
      expect(bodies).toContainEqual(expect.objectContaining({ globalAppendPrompt: '始终用中文' }));
    });
  });

  it('高级区默认收起：展开后人格只读汇总与恢复默认按钮可见，恢复需二次确认', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TuningPanel />);
    await screen.findByTestId('tuning-model-matrix');
    expect(screen.queryByTestId('tuning-advanced-body')).toBeNull();

    await user.click(screen.getByTestId('tuning-advanced-toggle'));
    const body = screen.getByTestId('tuning-advanced-body');
    expect(body.textContent).toContain('0.5 / 0.2 / 0.1 / 0.9');

    await user.click(within(body).getByRole('button', { name: '恢复该助手默认手感' }));
    // 先取消不请求
    await user.click(screen.getByRole('button', { name: '取消' }));
    const putsBefore = fetchMock.mock.calls.filter(
      (c) => c[0] === '/api/assistants/a1' && (c[1] as RequestInit).method === 'PATCH',
    ).length;

    await user.click(within(body).getByRole('button', { name: '恢复该助手默认手感' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => c[0] === '/api/assistants/a1' && (c[1] as RequestInit).method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(putsBefore);
      const bodyText = JSON.parse(
        (patchCalls[patchCalls.length - 1]![1] as RequestInit).body as string,
      );
      expect(bodyText).toMatchObject({
        temperature: 1,
        topP: 1,
        maxTokens: null,
        plannerModelId: null,
        executorModelId: null,
        reviewerModelId: null,
      });
    });
  });

  it('a11y：助手选择/矩阵下拉/滑杆/开关均有可访问名', async () => {
    renderWithProviders(<TuningPanel />);
    await screen.findByTestId('tuning-model-matrix');
    expect(screen.getByLabelText('调整对象')).toBeInTheDocument();
    expect(screen.getByLabelText('聊天')).toBeInTheDocument();
    expect(screen.getByLabelText('Planner（规划）')).toBeInTheDocument();
    expect(screen.getByLabelText('上下文条数（2–50）')).toBeInTheDocument();
    expect(screen.getByLabelText('全局追加提示词')).toBeInTheDocument();
  });
});
