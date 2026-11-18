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
      jobs.add(job);
      void job.finally(() => jobs.delete(job));
    },
    async wait(): Promise<void> {
      await Promise.allSettled([...jobs]);
    },
  };
}
