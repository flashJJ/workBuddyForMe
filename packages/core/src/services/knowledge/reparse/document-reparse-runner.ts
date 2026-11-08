/** v2.29 P1：文档批量重解析串行队列（进程内单飞，不落库）。 */

export type DocumentReparseBatchState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';

export interface DocumentReparseCandidate {
  id: string;
  filename: string;
}

export interface DocumentReparseFailure {
  documentId: string;
  filename: string;
  message: string;
}

export interface DocumentReparseBatchStatus {
  state: DocumentReparseBatchState;
  knowledgeBaseId: string | null;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  currentDocumentId: string | null;
  currentFilename: string | null;
  failures: DocumentReparseFailure[];
  startedAt: string | null;
  finishedAt: string | null;
  /** 已请求暂停：当前文档完成后停止 */
  pauseRequested: boolean;
  /** 已请求取消：当前文档完成后停止 */
  cancelRequested: boolean;
}

export interface DocumentReparseRunnerDeps {
  /** 按当前解析版本查询待重建文档 */
  listPending: (knowledgeBaseId: string) => DocumentReparseCandidate[];
  hasSource: (documentId: string) => boolean;
  reparseNow: (documentId: string) => Promise<unknown>;
  now?: () => string;
  /** 每篇之间的让出，默认 50ms，避免长时间占用事件循环 */
  wait?: () => Promise<void>;
}

function idleStatus(): DocumentReparseBatchStatus {
  return {
    state: 'idle',
    knowledgeBaseId: null,
    total: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    currentDocumentId: null,
    currentFilename: null,
    failures: [],
    startedAt: null,
    finishedAt: null,
    pauseRequested: false,
    cancelRequested: false,
  };
}

/**
 * 队列不持久化：候选集每次 start 时重新推导，重启后再次 start 即续跑剩余文档。
 * 暂停/取消都只在当前文档结束后的边界生效，避免中断正在提交的索引事务。
 */
export function createDocumentReparseRunner(deps: DocumentReparseRunnerDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const wait = deps.wait ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 50)));

  let status = idleStatus();
  let queue: DocumentReparseCandidate[] = [];
  let index = 0;
  let looping = false;
  let control: 'running' | 'paused' | 'cancelled' = 'running';

  const snapshot = (): DocumentReparseBatchStatus => ({
    ...status,
    failures: status.failures.map((failure) => ({ ...failure })),
  });

  async function loop(): Promise<void> {
    if (looping) return;
    looping = true;
    try {
      while (index < queue.length) {
        if (control === 'paused') {
          status.state = 'paused';
          return;
        }
        if (control === 'cancelled') {
          status.state = 'cancelled';
          status.finishedAt = now();
          return;
        }
        const candidate = queue[index++]!;
        if (!deps.hasSource(candidate.id)) {
          status.skipped += 1;
          continue;
        }
        status.currentDocumentId = candidate.id;
        status.currentFilename = candidate.filename;
        try {
          await deps.reparseNow(candidate.id);
          status.done += 1;
        } catch (error) {
          status.failed += 1;
          status.failures.push({
            documentId: candidate.id,
            filename: candidate.filename,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        status.currentDocumentId = null;
        status.currentFilename = null;
        await wait();
      }
      status.state = 'completed';
      status.finishedAt = now();
    } finally {
      looping = false;
    }
  }

  return {
    start(knowledgeBaseId: string): DocumentReparseBatchStatus {
      if (status.state === 'running' || status.state === 'paused') return snapshot();
      queue = deps.listPending(knowledgeBaseId).map((doc) => ({
        id: doc.id,
        filename: doc.filename,
      }));
      index = 0;
      control = 'running';
      status = {
        ...idleStatus(),
        state: 'running',
        knowledgeBaseId,
        total: queue.length,
        startedAt: now(),
      };
      if (queue.length === 0) {
        status.state = 'completed';
        status.finishedAt = now();
      } else {
        void loop();
      }
      return snapshot();
    },

    pause(): DocumentReparseBatchStatus {
      if (status.state === 'running') {
        control = 'paused';
        status.pauseRequested = true;
      }
      return snapshot();
    },

    resume(): DocumentReparseBatchStatus {
      const pausedWhileRunning = status.state === 'running' && status.pauseRequested;
      if (status.state !== 'paused' && !pausedWhileRunning) return snapshot();
      control = 'running';
      status.pauseRequested = false;
      status.cancelRequested = false;
      if (status.state !== 'running') {
        status.state = 'running';
        status.finishedAt = null;
        void loop();
      }
      return snapshot();
    },

    cancel(): DocumentReparseBatchStatus {
      if (status.state !== 'running' && status.state !== 'paused') return snapshot();
      control = 'cancelled';
      status.cancelRequested = true;
      if (!looping) {
        status.state = 'cancelled';
        status.finishedAt = now();
      }
      return snapshot();
    },

    status(): DocumentReparseBatchStatus {
      return snapshot();
    },
  };
}

export type DocumentReparseRunner = ReturnType<typeof createDocumentReparseRunner>;
