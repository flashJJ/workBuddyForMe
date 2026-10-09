import { POST_TURN_JOBS_TIMEOUT_MS } from '@wbfm/shared/constants';
import { runPostTurnJobs, type PostTurnJobsParams } from './post-turn-jobs';

/** 旁路任务入参：signal/traceParent 由调度器统一注入 */
export type PostTurnJobsInput = Omit<PostTurnJobsParams, 'signal' | 'traceParent'>;

export interface SchedulePostTurnJobsParams {
  /** 编排器注入的后台任务登记器（保留句柄供测试与优雅关闭等待） */
  schedule: (job: Promise<unknown>) => void;
  /** 请求 signal 已中断则不调度（与原编排器内联判定一致） */
  aborted: boolean;
  jobs: PostTurnJobsInput;
}

/**
 * done 之后收尾触发：摘要压缩/长期记忆作为 fire-and-forget 旁路任务。
 * 用独立 signal（响应关闭会 abort 请求 signal，但摘要/记忆不应随之丢弃），
 * 超时兜底；任务失败内部均已静默。
 */
export function schedulePostTurnJobs(params: SchedulePostTurnJobsParams): void {
  const { schedule, aborted, jobs } = params;
  if (aborted) return;
  const bgController = new AbortController();
  const bgTimer = setTimeout(() => bgController.abort(), POST_TURN_JOBS_TIMEOUT_MS);
  schedule(
    runPostTurnJobs({ ...jobs, signal: bgController.signal, traceParent: null })
      .catch(() => undefined)
      .finally(() => clearTimeout(bgTimer)),
  );
}
