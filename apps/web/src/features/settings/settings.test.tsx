// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Provider, ProviderModel } from '@wbfm/shared';
import { renderWithProviders } from '@/test/render';
import { ProviderFormDialog } from './provider-form-dialog';
import { ProviderCard } from './provider-card';

const PROVIDER: Provider = {
  id: 'p1',
  name: 'DeepSeek',
  protocol: 'openai-compatible',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKeyMasked: 'sk-****abcd',
  enabled: true,
  sortOrder: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const MODEL: ProviderModel = {
  id: 'mdl1',
  providerId: 'p1',
  modelId: 'gpt-4o-mini',
  displayName: 'GPT-4o mini',
  capabilities: ['chat'],
  contextWindow: null,
  createdAt: '2025-01-01T00:00:00.000Z',
};

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('设置中心（TR-25.1）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('新增供应商：提交完整表单含 apiKey', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'p2' }));
    const user = userEvent.setup();
    renderWithProviders(<ProviderFormDialog open onOpenChange={() => undefined} />);

    await user.type(screen.getByLabelText('名称'), 'Moonshot');
    await user.type(screen.getByLabelText('Base URL'), 'https://api.moonshot.cn/v1');
    await user.type(screen.getByLabelText('API Key'), 'sk-secret');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/providers', expect.anything()));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: 'Moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      protocol: 'openai-compatible',
      apiKey: 'sk-secret',
    });
  });

  it('编辑供应商：Key 留空不回传，占位符展示脱敏值', async () => {
    fetchMock.mockResolvedValue(ok(PROVIDER));
    const user = userEvent.setup();
    renderWithProviders(
      <ProviderFormDialog open onOpenChange={() => undefined} provider={PROVIDER} />,
    );

    const keyInput = (await screen.findByPlaceholderText(/sk-\*\*\*\*abcd/)) as HTMLInputElement;
    expect(keyInput.value).toBe('');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/providers/p1', expect.anything()));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('apiKey');
    expect(body).toMatchObject({ name: 'DeepSeek', enabled: true });
  });

  it('测试连接：成功展示连接成功，失败展示后端消息', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/providers/p1/models') return ok([]);
      if (url === '/api/providers/p1/test') return ok({ ok: true });
      return ok(null);
    });
    const user = userEvent.setup();
    renderWithProviders(<ProviderCard provider={PROVIDER} onEdit={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '测试连接' }));
    await waitFor(() => expect(screen.getByText('连接成功')).toBeInTheDocument());

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/providers/p1/test') return fail('PROVIDER_ERROR', '鉴权失败 401', 502);
      return ok([]);
    });
    await user.click(screen.getByRole('button', { name: '测试连接' }));
    await waitFor(() => expect(screen.getByText(/鉴权失败 401/)).toBeInTheDocument());
  });

  it('模型管理：勾选两种能力后添加，删除模型走确认', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/providers/p1/models' && init?.method === 'GET') return ok([MODEL]);
      if (url === '/api/providers/p1/models' && init?.method === 'POST') return ok({ id: 'mdl2' });
      if (url.startsWith('/api/models/') && init?.method === 'DELETE') return ok({ id: 'mdl1' });
      return ok(null);
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<ProviderCard provider={PROVIDER} onEdit={() => undefined} />);

    await screen.findByText('GPT-4o mini');
    await user.type(screen.getByLabelText('模型 ID'), 'text-embedding-3-small');
    await user.click(screen.getByLabelText('向量'));
    await user.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/providers/p1/models', expect.anything()),
    );
    const postCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/providers/p1/models' && (call[1] as RequestInit).method === 'POST',
    );
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toMatchObject({
      modelId: 'text-embedding-3-small',
      capabilities: ['chat', 'embedding'],
    });

    await user.click(screen.getByLabelText('移除模型 GPT-4o mini'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/models/mdl1', expect.anything()),
    );
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
