// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { OnboardingDialog } from './onboarding-dialog';

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(body: unknown, status = 502) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VOICE_STATUS = {
  asrReady: false,
  ttsReady: false,
  asrMissing: [],
  ttsMissing: [],
  asrTotalBytes: 0,
  ttsTotalBytes: 0,
  activeTtsModel: 'melo',
  ttsModels: [],
  downloads: {
    asr: { active: false, status: 'missing', bytesTotal: 0, bytesDone: 0, error: null },
    tts: { active: false, status: 'missing', bytesTotal: 0, bytesDone: 0, error: null },
    ttsByModel: {},
  },
};

function mockVoiceEndpoints(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/voice/settings') return ok({ ttsModel: 'melo' });
    if (url === '/api/voice/models/status') return ok(VOICE_STATUS);
    return ok(null);
  });
}

describe('首启向导 OnboardingDialog（v1.2 M5）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('欢迎→供应商→语音→完成线性前进，进入应用时回调', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/providers') return ok([]);
      if (url === '/api/voice/settings') return ok({ ttsModel: 'melo' });
      if (url === '/api/voice/models/status') return ok(VOICE_STATUS);
      return ok(null);
    });
    const onComplete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<OnboardingDialog open onComplete={onComplete} />);

    expect(screen.getByTestId('onboarding-welcome')).toBeInTheDocument();
    await user.click(screen.getByTestId('ob-next'));
    expect(screen.getByTestId('onboarding-provider')).toBeInTheDocument();

    // 上一步/下一步
    await user.click(screen.getByTestId('ob-next'));
    expect(screen.getByTestId('onboarding-voice')).toBeInTheDocument();
    await user.click(screen.getByTestId('ob-back'));
    expect(screen.getByTestId('onboarding-provider')).toBeInTheDocument();

    await user.click(screen.getByTestId('ob-next'));
    await user.click(screen.getByTestId('ob-next'));
    expect(screen.getByTestId('onboarding-finish')).toBeInTheDocument();
    expect(screen.queryByTestId('ob-skip')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('ob-enter'));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('欢迎页跳过直接完成回调', async () => {
    fetchMock.mockResolvedValue(ok([]));
    const onComplete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<OnboardingDialog open onComplete={onComplete} />);
    await user.click(screen.getByTestId('ob-skip'));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('云端面板：创建供应商并测试成功', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/providers' && init?.method === 'GET') return ok([]);
      if (url === '/api/providers' && init?.method === 'POST')
        return ok({ id: 'p9', name: 'Mine', protocol: 'openai-compatible', enabled: true });
      if (url === '/api/providers/p9/test' && init?.method === 'POST') return ok({ ok: true });
      return ok(null);
    });
    const user = userEvent.setup();
    renderWithProviders(<OnboardingDialog open onComplete={() => undefined} />);
    await user.click(screen.getByTestId('ob-next'));

    const cloud = screen.getByTestId('onboarding-cloud');
    await user.type(within(cloud).getByLabelText('名称'), 'Mine');
    await user.type(within(cloud).getByLabelText('Base URL'), 'https://api.example.com/v1');
    await user.click(within(cloud).getByTestId('ob-cloud-submit'));

    await waitFor(() =>
      expect(within(cloud).getByRole('status')).toHaveTextContent('连接成功，供应商已添加。'),
    );
    const createCall = (fetchMock.mock.calls as Array<[string, RequestInit | undefined]>).find(
      ([url, init]) => url === '/api/providers' && init?.method === 'POST',
    );
    expect(createCall).toBeTruthy();
  });

  it('Ollama 面板：首次检测失败给安装指引，再次成功后可添加发现的模型', async () => {
    mockVoiceEndpoints(fetchMock);
    let testAttempt = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/providers' && init?.method === 'GET') return ok([]);
      if (url === '/api/providers' && init?.method === 'POST')
        return ok({ id: 'oll', name: 'Ollama', protocol: 'ollama', enabled: true });
      if (url === '/api/providers/oll/test' && init?.method === 'POST') {
        testAttempt += 1;
        return testAttempt === 1
          ? fail({ success: false, error: { code: 'PROVIDER_ERROR', message: 'ECONNREFUSED' } })
          : ok({ ok: true });
      }
      if (url === '/api/providers/oll/models?remote=1')
        return ok([{ id: 'qwen2.5:7b', contextLength: 32768 }]);
      if (url === '/api/providers/oll/models' && init?.method === 'POST')
        return ok({ id: 'm1', modelId: 'qwen2.5:7b' });
      if (url === '/api/voice/settings') return ok({ ttsModel: 'melo' });
      if (url === '/api/voice/models/status') return ok(VOICE_STATUS);
      return ok(null);
    });

    const user = userEvent.setup();
    renderWithProviders(<OnboardingDialog open onComplete={() => undefined} />);
    await user.click(screen.getByTestId('ob-next'));
    await user.click(screen.getByTestId('ob-tab-ollama'));

    const panel = screen.getByTestId('onboarding-ollama');
    await user.click(within(panel).getByTestId('ob-ollama-detect'));
    await waitFor(() =>
      expect(within(panel).getByRole('alert')).toHaveTextContent(/ollama\.com\/download/),
    );

    await user.click(within(panel).getByTestId('ob-ollama-detect'));
    const chip = await within(panel).findByRole('button', { name: '+ qwen2.5:7b' });
    await user.click(chip);
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: /✓ qwen2\.5:7b/ })).toBeDisabled(),
    );
    const addCall = (fetchMock.mock.calls as Array<[string, RequestInit | undefined]>).find(
      ([url, init]) => url === '/api/providers/oll/models' && init?.method === 'POST',
    );
    expect(JSON.parse((addCall![1] as RequestInit).body as string)).toMatchObject({
      modelId: 'qwen2.5:7b',
      capabilities: ['chat'],
    });
  });
});
