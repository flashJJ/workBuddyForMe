/**
 * 知识编译后台队列（v1.3 M4）。
 *
 * 全局单并发 FIFO：同一时刻最多一个文档在编译，入队顺序即执行顺序
 * （每库天然串行），规避本地模型并发限流与 SQLite 写竞争。
 *
 * 进度为内存态（进程重启即丢，未跑完的文档保持 DB queued，下次入队自愈）；
 * 文档级状态真源是 documents.compile_status，队列只负责调度与取消。
 * 事件监听器供 SSE 通道推送进度（progress 每文档两拍：开跑/收尾）。
 */

import { createCompileWriteRepository, createSettingsRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { compileDocument } from './knowledge-compiler';
import { createLlmKnowledgeEnhancer } from './llm-enhancer';

const SETTINGS_KEY = 'app-settings';
const CANCELLED_MESSAGE = '编译已取消';

export interface CompileQueueJob {
  kbId: string;
  documentId: string;
  withLlm: boolean;
}

/** 每库进度快照（SSE 事件与查询共用；done 含失败） */
export interface CompileKbProgress {
  kbId: string;
  running: boolean;
  currentDocumentId: string | null;
  done: number;
  failed: number;
  total: number;
}

export type CompileQueueEvent =
  | { type: 'progress'; progress: CompileKbProgress }
  | { type: 'idle'; progress: CompileKbProgress };

export interface CompileEnqueueResult {
  queued: number;
  skipped: number;
}

export interface CompileCancelResult {
  dropped: number;
  aborted: boolean;
}

export interface CompileQueueService {
  enqueue(kbId: string, documentIds: string[], opts?: { withLlm?: boolean }): CompileEnqueueResult;
  cancel(kbId: string, documentId?: string): CompileCancelResult;
  getProgress(kbId: string): CompileKbProgress | null;
  subscribe(listener: (event: CompileQueueEvent) => void): () => void;
}

interface QueueState {
  pending: CompileQueueJob[];
  current: CompileQueueJob | null;
  controller: AbortController | null;
  progress: Map<string, CompileKbProgress>;
  listeners: Set<(event: CompileQueueEvent) => void>;
}

export function createCompileQueueService(deps: ServiceDeps): CompileQueueService {
  const state: QueueState = {
    pending: [],
    current: null,
    controller: null,
    progress: new Map(),
    listeners: new Set(),
  };
  const writeStatus = createCompileWriteRepository(deps.db);

  const emit = (event: CompileQueueEvent) => {
    for (const listener of state.listeners) listener(event);
  };

  const ensureProgress = (kbId: string): CompileKbProgress => {
    let entry = state.progress.get(kbId);
    if (!entry) {
      entry = { kbId, running: false, currentDocumentId: null, done: 0, failed: 0, total: 0 };
      state.progress.set(kbId, entry);
    }
    return entry;
  };

  const readSettings = () =>
    createSettingsRepository(deps.db).getJson(SETTINGS_KEY, null) as
      | { compileWithLlm?: boolean; compileModelId?: string | null }
      | null;

  const sameJob = (job: CompileQueueJob, kbId: string, documentId?: string) =>
    job.kbId === kbId && (!documentId || job.documentId === documentId);

  async function runJob(job: CompileQueueJob): Promise<void> {
    state.current = job;
    state.controller = new AbortController();
    const progress = ensureProgress(job.kbId);
    progress.running = true;
    progress.currentDocumentId = job.documentId;
    emit({ type: 'progress', progress: { ...progress } });
    let failed = false;
    try {
      const settings = readSettings();
      const enhancer = job.withLlm
        ? createLlmKnowledgeEnhancer(deps, { modelId: settings?.compileModelId ?? null })
        : undefined;
      await compileDocument(deps, job.documentId, {
        ...(enhancer ? { enhancer } : {}),
        signal: state.controller.signal,
      });
    } catch {
      // compileDocument 已把异常翻转 failed；取消场景统一改写为明确文案
      // （文档可能已删除/库已关闭——回写失败静默吞掉，不影响队列收尾）
      failed = true;
      if (state.controller.signal.aborted) {
        try {
          writeStatus.updateCompileStatus(job.documentId, 'failed', { error: CANCELLED_MESSAGE });
        } catch {
          /* 忽略回写失败 */
        }
      }
    } finally {
      progress.done += 1;
      if (failed) progress.failed += 1;
      progress.currentDocumentId = null;
      state.current = null;
      state.controller = null;
      const remaining = state.pending.some((j) => j.kbId === job.kbId);
      if (remaining) {
        emit({ type: 'progress', progress: { ...progress } });
      } else {
        progress.running = false;
        emit({ type: 'idle', progress: { ...progress } });
      }
      pump();
    }
  }

  function pump(): void {
    if (state.current) return;
    const job = state.pending.shift();
    if (!job) return;
    void runJob(job);
  }

  return {
    enqueue(kbId, documentIds, opts = {}) {
      const withLlm = opts.withLlm === true || readSettings()?.compileWithLlm === true;
      const hasActive =
        state.current?.kbId === kbId || state.pending.some((j) => j.kbId === kbId);
      const progress = ensureProgress(kbId);
      if (!hasActive) {
        // 上一轮已收尾：本轮从零计数
        progress.done = 0;
        progress.failed = 0;
        progress.total = 0;
      }
      let queued = 0;
      let skipped = 0;
      for (const documentId of documentIds) {
        const duplicate =
          (state.current && sameJob(state.current, kbId, documentId)) ||
          state.pending.some((j) => sameJob(j, kbId, documentId));
        if (duplicate) {
          skipped += 1;
          continue;
        }
        state.pending.push({ kbId, documentId, withLlm });
        progress.total += 1;
        queued += 1;
      }
      if (queued > 0) emit({ type: 'progress', progress: { ...progress } });
      pump();
      return { queued, skipped };
    },

    cancel(kbId, documentId) {
      let dropped = 0;
      state.pending = state.pending.filter((job) => {
        if (sameJob(job, kbId, documentId)) {
          dropped += 1;
          return false;
        }
        return true;
      });
      let aborted = false;
      if (state.current && sameJob(state.current, kbId, documentId)) {
        state.controller?.abort();
        aborted = true;
      }
      const progress = state.progress.get(kbId);
      if (progress && dropped > 0) {
        progress.total = Math.max(0, progress.total - dropped);
        // 当前任务的中止由 runJob finally 收尾发 idle，避免双重事件
        if (!aborted) {
          const remaining = state.pending.some((j) => j.kbId === kbId);
          if (remaining) emit({ type: 'progress', progress: { ...progress } });
          else {
            progress.running = false;
            emit({ type: 'idle', progress: { ...progress } });
          }
        }
      }
      return { dropped, aborted };
    },

    getProgress(kbId) {
      const entry = state.progress.get(kbId);
      return entry ? { ...entry } : null;
    },

    subscribe(listener) {
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
  };
}

/* 模块级单例：容器与摄入管线共享同一队列（测试用 reset 隔离） */
let singleton: CompileQueueService | null = null;

export function getCompileQueueService(deps: ServiceDeps): CompileQueueService {
  if (!singleton) singleton = createCompileQueueService(deps);
  return singleton;
}

/** 仅供测试：丢弃单例（连同未完成任务），下个调用以新 deps 重建 */
export function resetCompileQueueServiceForTest(): void {
  singleton = null;
}
