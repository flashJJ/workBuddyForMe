import { describe, expect, it } from 'vitest';
import { createBackgroundJobRegistry } from './background-jobs';

describe('createBackgroundJobRegistry（回合后台任务登记）', () => {
  it('job reject 被吞掉：不产生未处理拒绝，wait 正常返回', async () => {
    const registry = createBackgroundJobRegistry();
    registry.schedule(Promise.reject(new Error('boom')));
    await expect(registry.wait()).resolves.toBeUndefined();
  });

  it('wait 等待在途任务结束', async () => {
    const registry = createBackgroundJobRegistry();
    let done = false;
    registry.schedule(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          done = true;
          resolve();
        }, 10);
      }),
    );
    await registry.wait();
    expect(done).toBe(true);
  });
});
