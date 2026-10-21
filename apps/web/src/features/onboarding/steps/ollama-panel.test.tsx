// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { OllamaPanel } from './ollama-panel';

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(message: string, status = 502) {
  return new Response(JSON.stringify({ success: false, error: { code: 'PROVIDER_ERROR', message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** 构造 SSE 响应体；帧之间可插入延迟，便于观察中间进度态 */
function sseBody(frames: string[], gapMs = 0): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
        if (gapMs > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
      }
      controller.close();
    },
  });
}

const PROVIDER_JSON = { id: 'oll', name: 'Ollama', protocol: 'ollama', enabled: true };

describe('向导 Ollama 面板（v2.4 P0-1 T4）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('未装：检测失败给可执行指引（winget 命令 + 官网下载 + 拉取示例）', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/providers' && !init?.method) return ok([]);
      if (url === '/api/providers' && init?.method === 'POST') return ok(PROVIDER_JSON);
      if (url === '/api/providers/oll/test') return fail('ECONNREFUSED');
      return ok(null);
    });

    const user = userEvent.setup();
    renderWithProviders(<OllamaPanel onReady={() => undefined} />);
    await user.click(screen.getByTestId('ob-ollama-detect'));

    const guide = await screen.findByTestId('ob-ollama-install');
    expect(within(guide).getByTestId('ob-ollama-winget')).toHaveTextContent(
      'winget install --id Ollama.Ollama',
    );
    expect(within(guide).getByRole('link', { name: 'ollama.com/download' })).toHaveAttribute(
      'href',
      'https://ollama.com/download',
    );
    expect(guide).toHaveTextContent('ollama pull qwen2.5:7b');
  });

  it('已装：推荐模型明示体积与耗时档，一键拉取显示进度与完成态', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/providers' && !init?.method) return ok([]);
      if (url === '/api/providers' && init?.method === 'POST') return ok(PROVIDER_JSON);
      if (url === '/api/providers/oll/test') return ok({ ok: true });
      if (url === '/api/providers/oll/models?remote=1') return ok([]);
      if (url === '/api/providers/oll/models') return ok([]);
      if (url === '/api/system/ollama/pull') {
        return new Response(
          sseBody(
            [
              'event: progress\ndata: {"status":"downloading","total":100,"completed":42,"percent":42}\n\n',
              'event: done\ndata: {"model":"qwen2.5:7b"}\n\n',
            ],
            150,
          ),
          { status: 200 },
        );
      }
      return ok(null);
    });

    const user = userEvent.setup();
    renderWithProviders(<OllamaPanel onReady={() => undefined} />);
    await user.click(screen.getByTestId('ob-ollama-detect'));

    const card = await screen.findByTestId('ob-ollama-pull-qwen2.5:7b');
    expect(card).toHaveTextContent('约 4.7 GB');
    expect(card).toHaveTextContent('预计数分钟到十几分钟（视网速）');

    await user.click(within(card).getByTestId('ob-ollama-pull-btn-qwen2.5:7b'));
    const progress = await screen.findByTestId('ob-ollama-pull-progress');
    expect(progress).toHaveTextContent('已下载 42%');
    await waitFor(() =>
      expect(within(card).getByTestId('ob-ollama-pull-btn-qwen2.5:7b')).toHaveTextContent(
        '已拉取完成',
      ),
    );
  });

  it('拉取失败：显示错误文案（不阻断向导）', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/providers' && !init?.method) return ok([]);
      if (url === '/api/providers' && init?.method === 'POST') return ok(PROVIDER_JSON);
      if (url === '/api/providers/oll/test') return ok({ ok: true });
      if (url === '/api/providers/oll/models?remote=1') return ok([]);
      if (url === '/api/system/ollama/pull') {
        return new Response(
          sseBody(['event: error\ndata: {"message":"disk full"}\n\n']),
          { status: 200 },
        );
      }
      return ok(null);
    });

    const user = userEvent.setup();
    renderWithProviders(<OllamaPanel onReady={() => undefined} />);
    await user.click(screen.getByTestId('ob-ollama-detect'));
    const card = await screen.findByTestId('ob-ollama-pull-qwen2.5:7b');
    await user.click(within(card).getByTestId('ob-ollama-pull-btn-qwen2.5:7b'));

    await waitFor(() =>
      expect(screen.getByTestId('ob-ollama-pull-error')).toHaveTextContent('拉取失败：disk full'),
    );
  });
});
