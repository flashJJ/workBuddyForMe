/**
 * v4.8：对话回合后台任务登记器（摘要/记忆等旁路任务）。
 * 保留在途句柄供测试与优雅关闭等待，不影响响应本身。
 */
export interface BackgroundJobRegistry {
  schedule(job: Promise<unknown>): void;
  /** 等待全部在途任务结束（测试/关闭用） */
  wait(): Promise<void>;
}

export function createBackgroundJobRegistry(): BackgroundJobRegistry {
  const jobs = new Set<Promise<unknown>>();
  return {
    schedule(job: Promise<unknown>): void {
      // 登记时即吞掉拒绝：finally 链不会产生 unhandledRejection，
      // wait 仍是 allSettled 语义，不改变调用方可见行为。
      const tracked = job.catch(() => undefined);
      jobs.add(tracked);
      void tracked.finally(() => jobs.delete(tracked));
    },
    async wait(): Promise<void> {
      await Promise.allSettled([...jobs]);
    },
  };
}
