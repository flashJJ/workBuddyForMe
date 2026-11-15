import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWithDevRetry, waitForServer } from './wait-for-server';

describe('waitForServer 端口探测（TR-30.2）', () => {
  it('健康检查 200 即就绪，携带托管 token', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('ok', { status: 200 }));
    await waitForServer('http://127.0.0.1:51000', 'tok', { fetchImpl, intervalMs: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://127.0.0.1:51000/api/health');
    const init = fetchImpl.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)['x-wbfm-token']).toBe('tok');
  });

  it('非 200 持续失败直到超时并抛错', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 503 }));
    await expect(
      waitForServer('http://127.0.0.1:51001', 'tok', {
        fetchImpl,
        timeoutMs: 0,
        intervalMs: 1,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/未就绪/);
  });

  it('连接拒绝（fetch 抛错）后重试至就绪', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await waitForServer('http://127.0.0.1:51002', 'tok', {
      fetchImpl,
      timeoutMs: 5000,
      intervalMs: 1,
      sleep: async () => undefined,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

type Handler = (...args: unknown[]) => void;

function fakeWindow(): {
  win: BrowserWindow;
  loadURL: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
  destroy: () => void;
} {
  const handlers = new Map<string, Handler[]>();
  let destroyed = false;
  const loadURL = vi.fn();
  const win = {
    webContents: {
      on: (event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
    },
    loadURL,
    isDestroyed: () => destroyed,
    once: vi.fn(),
  } as unknown as BrowserWindow;
  return {
    win,
    loadURL,
    emit: (event, ...args) => {
      for (const handler of handlers.get(event) ?? []) handler({}, ...args);
    },
    destroy: () => {
      destroyed = true;
    },
  };
}

describe('loadWithDevRetry dev 兜底（黑屏恢复）', () => {
  afterEach(() => vi.useRealTimers());

  it('主框架连接失败后延迟重载，成功加载恢复重试额度', () => {
    vi.useFakeTimers();
    const { win, loadURL, emit } = fakeWindow();
    loadWithDevRetry(win, 'http://127.0.0.1:3000/pet', { attempts: 1, delayMs: 1000 });
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:3000/pet');

    emit('did-fail-load', -102, 'ERR_CONNECTION_REFUSED', 'http://127.0.0.1:3000/pet', true);
    vi.advanceTimersByTime(1000);
    expect(loadURL).toHaveBeenCalledTimes(2);

    emit('did-finish-load');
    emit('did-fail-load', -102, 'ERR_CONNECTION_REFUSED', 'http://127.0.0.1:3000/pet', true);
    vi.advanceTimersByTime(1000);
    expect(loadURL).toHaveBeenCalledTimes(3);
  });

  it('重试额度用尽后停止重载', () => {
    vi.useFakeTimers();
    const { win, loadURL, emit } = fakeWindow();
    loadWithDevRetry(win, 'http://127.0.0.1:3000/pet', { attempts: 2, delayMs: 500 });
    for (let i = 0; i < 4; i += 1) {
      emit('did-fail-load', -102, 'ERR_CONNECTION_REFUSED', 'http://127.0.0.1:3000/pet', true);
      vi.advanceTimersByTime(500);
    }
    expect(loadURL).toHaveBeenCalledTimes(3);
  });

  it('忽略子框架、ERR_ABORTED 与已销毁窗口', () => {
    vi.useFakeTimers();
    const { win, loadURL, emit, destroy } = fakeWindow();
    loadWithDevRetry(win, 'http://127.0.0.1:3000/pet', { delayMs: 500 });
    emit('did-fail-load', -102, 'ERR_CONNECTION_REFUSED', 'http://127.0.0.1:3000/pet', false);
    emit('did-fail-load', -3, 'ERR_ABORTED', 'http://127.0.0.1:3000/pet', true);
    vi.advanceTimersByTime(500);
    expect(loadURL).toHaveBeenCalledTimes(1);

    destroy();
    emit('did-fail-load', -102, 'ERR_CONNECTION_REFUSED', 'http://127.0.0.1:3000/pet', true);
    vi.advanceTimersByTime(500);
    expect(loadURL).toHaveBeenCalledTimes(1);
  });
});
