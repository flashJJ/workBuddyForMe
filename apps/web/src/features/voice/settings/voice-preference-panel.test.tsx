// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_VOICE_SETTINGS, type VoiceModelDownload, type VoiceModelStatus } from '@wbfm/shared';
import { renderWithProviders } from '@/test/render';
import { VoicePreferencePanel } from './voice-preference-panel';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function dlFixture(
  partial?: Partial<VoiceModelDownload>,
  bytesTotal = 191_000_000,
): VoiceModelDownload {
  return {
    active: false,
    status: 'missing',
    bytesTotal,
    bytesDone: 0,
    error: null,
    ...partial,
  };
}

interface StatusOverrides extends Partial<VoiceModelDownload> {
  asrReady?: boolean;
  ttsReady?: boolean;
  meloReady?: boolean;
}

function statusFixture(partial: StatusOverrides = {}): VoiceModelStatus {
  const { asrReady = false, ttsReady = false, meloReady = false, ...asrOverrides } = partial;
  const asr = dlFixture(
    {
      status: 'missing',
      ...asrOverrides,
    },
    239_549_735,
  );
  const kokoroDl = dlFixture();
  const meloDl = dlFixture(undefined, 191_000_000);
  return {
    asrReady,
    ttsReady,
    asrMissing: [],
    ttsMissing: [],
    asrTotalBytes: 239_549_735,
    ttsTotalBytes: 394_000_000,
    activeTtsModel: 'kokoro',
    ttsModels: [
      { model: 'kokoro', label: 'Kokoro 多角色声线（103 音色）', totalBytes: 394_000_000, ready: ttsReady, missing: [] },
      { model: 'melo', label: 'MeloTTS 中英女声（单声低延迟）', totalBytes: 191_000_000, ready: meloReady, missing: [] },
    ],
    downloads: {
      asr,
      tts: kokoroDl,
      ttsByModel: { kokoro: kokoroDl, melo: meloDl },
    },
  };
}

describe('VoicePreferencePanel', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/api/system/info')) {
        return Promise.resolve(ok({ dataDir: 'E:\\data' }));
      }
      if (url.endsWith('/api/voice/settings')) {
        return Promise.resolve(ok(DEFAULT_VOICE_SETTINGS));
      }
      if (url.endsWith('/api/voice/models/status')) {
        return Promise.resolve(ok(statusFixture()));
      }
      return Promise.resolve(ok({}));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('未下载态：ASR/双 TTS 三个下载入口，引擎开关与试听均禁用；默认选中 Kokoro', async () => {
    renderWithProviders(<VoicePreferencePanel />);

    expect(await screen.findByTestId('voice-model-start-asr')).toBeEnabled();
    expect(screen.getByTestId('voice-model-start-tts-kokoro')).toBeEnabled();
    expect(screen.getByTestId('voice-model-start-tts-melo')).toBeEnabled();
    expect(screen.getByTestId('voice-model-card-asr')).toHaveTextContent('未下载');
    expect(screen.getByTestId('voice-model-card-tts-kokoro')).toHaveTextContent('未下载');
    expect(screen.getByTestId('voice-model-card-tts-melo')).toHaveTextContent('未下载');
    expect(screen.getByLabelText(/启用语音输入/)).toBeDisabled();
    expect(screen.getByLabelText(/回复自动朗读/)).toBeDisabled();
    expect(screen.getByTestId('tts-preview-button')).toBeDisabled();

    const kokoroRadio = within(screen.getByTestId('tts-model-option-kokoro')).getByRole('radio');
    const meloRadio = within(screen.getByTestId('tts-model-option-melo')).getByRole('radio');
    expect(kokoroRadio).toBeChecked();
    expect(meloRadio).not.toBeChecked();
  });

  it('点击下载/取消：ASR POST 正确 kind 与 action', async () => {
    const user = userEvent.setup();
    // 第一次 start 后切换为下载中状态（取消按钮出现）
    let fixture = statusFixture();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/voice/models/status')) return Promise.resolve(ok(fixture));
      if (url.endsWith('/api/voice/settings')) return Promise.resolve(ok(DEFAULT_VOICE_SETTINGS));
      if (url.endsWith('/api/system/info')) return Promise.resolve(ok({ dataDir: 'E:\\data' }));
      if (url.endsWith('/api/voice/models/download') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.action === 'start' && body.kind === 'asr') {
          fixture = statusFixture({
            status: 'downloading',
            active: true,
            bytesDone: 120_000_000,
          });
        } else {
          fixture = statusFixture();
        }
        return Promise.resolve(ok({ started: true }));
      }
      return Promise.resolve(ok({}));
    });

    renderWithProviders(<VoicePreferencePanel />);
    await user.click(await screen.findByTestId('voice-model-start-asr'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/models/download'));
      expect(JSON.parse(String(call![1].body))).toEqual({ kind: 'asr', action: 'start' });
    });

    // 状态查询进入下载中（react-query 不会自动重查，手动改 fixture 后等待 mutation 失效重取）
    await waitFor(() => expect(screen.getByTestId('voice-model-cancel-asr')).toBeEnabled());
    expect(
      within(screen.getByTestId('voice-model-card-asr')).getByTestId('voice-model-state'),
    ).toHaveTextContent('下载中 50%');

    await user.click(screen.getByTestId('voice-model-cancel-asr'));
    await waitFor(() => {
      const calls = fetchMock.mock.calls
        .filter(([u]) => String(u).endsWith('/models/download'))
        .map((c) => JSON.parse(String(c[1].body)));
      expect(calls).toContainEqual({ kind: 'asr', action: 'cancel' });
    });
  });

  it('MeloTTS 卡下载：POST 携带 model=melo', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VoicePreferencePanel />);
    await user.click(await screen.findByTestId('voice-model-start-tts-melo'));
    await waitFor(() => {
      const calls = fetchMock.mock.calls
        .filter(([u]) => String(u).endsWith('/models/download'))
        .map((c) => JSON.parse(String(c[1].body)));
      expect(calls).toContainEqual({ kind: 'tts', model: 'melo', action: 'start' });
    });
  });

  it('切换朗读引擎为 MeloTTS：PUT ttsModel=melo，选项卡即时选中', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/voice/models/status')) {
        return Promise.resolve(ok(statusFixture({ asrReady: true, ttsReady: true, meloReady: true })));
      }
      if (url.endsWith('/api/voice/settings') && init?.method === 'PUT') {
        return Promise.resolve(
          ok({ ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(String(init.body)) }),
        );
      }
      if (url.endsWith('/api/voice/settings')) return Promise.resolve(ok(DEFAULT_VOICE_SETTINGS));
      if (url.endsWith('/api/system/info')) return Promise.resolve(ok({ dataDir: 'E:\\data' }));
      return Promise.resolve(ok({}));
    });

    renderWithProviders(<VoicePreferencePanel />);
    const meloRadio = within(await screen.findByTestId('tts-model-option-melo')).getByRole('radio');
    await user.click(meloRadio);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([u, init]) => String(u).endsWith('/voice/settings') && init?.method === 'PUT',
      );
      expect(JSON.parse(String(put![1].body))).toEqual({ ttsModel: 'melo' });
    });
    expect(meloRadio).toBeChecked();
    expect(
      within(screen.getByTestId('tts-model-option-kokoro')).getByRole('radio'),
    ).not.toBeChecked();
  });

  it('ASR 模型就绪后可开启语音输入：PUT asrEnabled=true', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/voice/models/status')) {
        return Promise.resolve(ok(statusFixture({ asrReady: true, ttsReady: true, status: 'ready' })));
      }
      if (url.endsWith('/api/voice/settings') && init?.method === 'PUT') {
        return Promise.resolve(ok({ ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(String(init.body)) }));
      }
      if (url.endsWith('/api/voice/settings')) return Promise.resolve(ok(DEFAULT_VOICE_SETTINGS));
      if (url.endsWith('/api/system/info')) return Promise.resolve(ok({ dataDir: 'E:\\data' }));
      return Promise.resolve(ok({}));
    });

    renderWithProviders(<VoicePreferencePanel />);
    const checkbox = await screen.findByLabelText(/启用语音输入/);
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([u, init]) => String(u).endsWith('/voice/settings') && init?.method === 'PUT',
      );
      expect(JSON.parse(String(put![1].body))).toMatchObject({ asrEnabled: true });
    });
    expect(screen.getByTestId('tts-preview-button')).toBeEnabled();
  });
});
