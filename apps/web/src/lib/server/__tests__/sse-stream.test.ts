import { describe, expect, it, vi } from 'vitest';
import { sseResponse, type SseStreamEvent } from '../sse-stream';

describe('sseResponse 取消感知（B-52）', () => {
  it('客户端取消后停止拉取上游并执行 return 收尾', async () => {
    let pulls = 0;
    let finalized = false;
    async function* events(): AsyncGenerator<SseStreamEvent> {
      try {
        for (;;) {
          // 每帧让出一个宏任务，模拟真实上游（历史/总线）的异步产出节奏
          await new Promise((resolve) => setTimeout(resolve, 0));
          pulls += 1;
          yield { event: 'delta', data: { content: String(pulls) } } as SseStreamEvent;
        }
      } finally {
        finalized = true;
      }
    }

    const response = sseResponse(events());
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);

    await reader.cancel();
    await vi.waitFor(() => expect(finalized).toBe(true), { timeout: 1_000 });

    const frozen = pulls;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pulls).toBe(frozen);
  });
});
