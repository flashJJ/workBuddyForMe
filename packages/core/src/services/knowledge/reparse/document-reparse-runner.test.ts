import { describe, expect, it, vi } from 'vitest';
import {
  createDocumentReparseRunner,
  type DocumentReparseCandidate,
  type DocumentReparseRunnerDeps,
} from './document-reparse-runner';

const docs: DocumentReparseCandidate[] = [
  { id: 'd1', filename: 'a.pdf' },
  { id: 'd2', filename: 'b.pdf' },
];

function runnerWith(overrides: Partial<DocumentReparseRunnerDeps> = {}) {
  return createDocumentReparseRunner({
    listPending: () => docs,
    hasSource: () => true,
    reparseNow: async () => undefined,
    wait: async () => undefined,
    now: () => '2026-11-09T00:00:00.000Z',
    ...overrides,
  });
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (check()) return;
    await Promise.resolve();
  }
  throw new Error('等待队列状态超时');
}

describe('document-reparse-runner（v2.29 P1）', () => {
  it('串行处理全部候选，统计完成数', async () => {
    const order: string[] = [];
    const runner = runnerWith({
      reparseNow: async (id) => {
        order.push(id);
      },
    });
    const started = runner.start('kb1');
    expect(started.total).toBe(2);
    await waitFor(() => runner.status().state === 'completed');
    expect(order).toEqual(['d1', 'd2']);
    expect(runner.status()).toMatchObject({ done: 2, failed: 0, skipped: 0 });
  });

  it('缺原始文件跳过，单篇失败不影响后续', async () => {
    const runner = runnerWith({
      hasSource: (id) => id !== 'd1',
      reparseNow: async () => {
        throw new Error('解析失败');
      },
    });
    runner.start('kb1');
    await waitFor(() => runner.status().state === 'completed');
    expect(runner.status()).toMatchObject({ done: 0, failed: 1, skipped: 1 });
    expect(runner.status().failures[0]).toMatchObject({
      documentId: 'd2',
      message: '解析失败',
    });
  });

  it('暂停在当前文档结束后生效，继续后跑完剩余文档', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = runnerWith({
      reparseNow: async (id) => {
        if (id === 'd1') await gate;
      },
    });
    runner.start('kb1');
    runner.pause();
    expect(runner.status().pauseRequested).toBe(true);
    release();
    await waitFor(() => runner.status().state === 'paused');
    expect(runner.status().done).toBe(1);

    runner.resume();
    await waitFor(() => runner.status().state === 'completed');
    expect(runner.status().done).toBe(2);
  });

  it('运行中再次 start 不会重入', async () => {
    const reparseNow = vi.fn(async () => undefined);
    const runner = runnerWith({ reparseNow });
    runner.start('kb1');
    const second = runner.start('kb1');
    expect(second.knowledgeBaseId).toBe('kb1');
    await waitFor(() => runner.status().state === 'completed');
    expect(reparseNow).toHaveBeenCalledTimes(2);
  });
});
