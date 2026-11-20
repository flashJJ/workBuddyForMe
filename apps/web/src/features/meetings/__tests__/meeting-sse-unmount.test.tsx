// @vitest-environment jsdom
import { transferableAbortController } from 'node:util';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { delay, http, setupMsw } from '@wbfm/ai/testing/msw';
import { useMeetingRoom } from '../use-meeting-room';
import { useMeetingStage } from '../../stage/use-meeting-stage';

/**
 * B-51：会议事件流进行中卸载页面，abort 不应产生未处理拒绝。
 * 网络层用 MSW（门禁禁止新增 vi.stubGlobal('fetch')）。
 */
// jsdom 的 AbortSignal 与 Node/undici 不是同一实现，MSW 拦截时会因 instanceof 校验失败
const nodeAbort = transferableAbortController();
vi.stubGlobal('AbortController', nodeAbort.constructor);
vi.stubGlobal('AbortSignal', nodeAbort.signal.constructor);

const state = vi.hoisted(() => ({ requests: 0 }));

const server = setupMsw([
  http.get('/api/meetings/:id/events', async () => {
    state.requests += 1;
    // 永不返回：客户端靠 AbortController 断开
    await delay('infinite');
    return new Response(null, { status: 204 });
  }),
]);

vi.mock('@/components/common/toast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/lib/api/client', () => ({
  apiGet: vi.fn(async () => ({
    meeting: {
      id: 'm1',
      topic: '测试会议',
      status: 'active',
      mode: 'round_robin',
      autoRounds: 0,
      memberIds: ['a', 'b'],
      modelId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    members: [
      { id: 'a', name: '甲' },
      { id: 'b', name: '乙' },
    ],
    messages: [],
  })),
  apiPost: vi.fn(async () => ({ ok: true })),
  apiSend: vi.fn(async () => ({ ok: true })),
  withManagedHeaders: () => ({}),
}));

describe('会议 SSE 卸载（B-51）', () => {
  afterEach(() => {
    server.resetHandlers();
    state.requests = 0;
  });

  function trackRejections(): { readonly reasons: unknown[]; stop: () => void } {
    const reasons: unknown[] = [];
    const onRejection = (reason: unknown) => {
      reasons.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    return { reasons, stop: () => process.off('unhandledRejection', onRejection) };
  }

  it('会场页在事件流中途卸载不产生未处理拒绝', async () => {
    const tracker = trackRejections();
    const { unmount } = renderHook(() => useMeetingRoom('m1'));
    await waitFor(() => expect(state.requests).toBeGreaterThan(0));

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));
    tracker.stop();

    expect(tracker.reasons).toHaveLength(0);
  });

  it('舞台在事件流中途卸载不产生未处理拒绝', async () => {
    const controller = {
      setRunStatus: vi.fn(),
      applyDirection: vi.fn(),
    } as unknown as Parameters<typeof useMeetingStage>[1];
    const tracker = trackRejections();
    const { unmount } = renderHook(() => useMeetingStage('m1', controller));
    await waitFor(() => expect(state.requests).toBeGreaterThan(0));

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));
    tracker.stop();

    expect(tracker.reasons).toHaveLength(0);
  });
});
