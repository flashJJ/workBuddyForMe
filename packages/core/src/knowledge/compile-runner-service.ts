/**
 * 知识编译触发服务（v1.3 M4：入队门面）。
 *
 * 语义：解析编译目标集合后投递到全局单并发后台队列即返回（异步执行）。
 * scope=new 含 queued+failed（failed 即「重试」入口）；规则通道零模型调用，
 * withLlm/设置开启时挂载可选增强器（编译器内任何失败仍降级规则）。
 * 执行/进度/取消详见 compile-queue-service。
 */

import { createDocumentRepository, createKnowledgeRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import {
  createCompileQueueService,
  getCompileQueueService,
  resetCompileQueueServiceForTest,
  type CompileCancelResult,
  type CompileEnqueueResult,
  type CompileKbProgress,
  type CompileQueueEvent,
  type CompileQueueService,
} from './compile-queue-service';

export type CompileScope = 'new' | 'all' | 'document';

export interface CompileScopeOptions {
  scope: CompileScope;
  documentId?: string;
  withLlm?: boolean;
}

export interface CompileStatusCounts {
  queued: number;
  running: number;
  ready: number;
  failed: number;
  skipped: number;
}

export interface CompileStatusSnapshot {
  counts: CompileStatusCounts;
  progress: CompileKbProgress | null;
}

export function createCompileRunnerService(deps: ServiceDeps) {
  const queue = getCompileQueueService(deps);

  return {
    /** 解析目标并入队（立即返回；执行在后台队列） */
    compileKnowledgeBase(knowledgeBaseId: string, options: CompileScopeOptions): CompileEnqueueResult {
      const kbRepo = createKnowledgeRepository(deps.db);
      if (!kbRepo.findById(knowledgeBaseId)) {
        throw new Error(`knowledge base not found: ${knowledgeBaseId}`);
      }
      const docRepo = createDocumentRepository(deps.db);
      const all = docRepo.listByKnowledgeBase(knowledgeBaseId);

      let targets = all;
      if (options.scope === 'document') {
        if (!options.documentId) throw new Error('document scope requires documentId');
        const target = all.find((d) => d.id === options.documentId);
        if (!target) throw new Error(`document not found in kb: ${options.documentId}`);
        targets = [target];
      } else if (options.scope === 'new') {
        // queued=待编；failed=上次失败待重试（重试入口），ready/skipped 不在范围
        targets = all.filter((d) => d.compileStatus === 'queued' || d.compileStatus === 'failed');
      } else {
        // all：全部已分片文档（chunk_count>0），无论既有编译状态
        targets = all.filter((d) => d.chunkCount > 0);
      }

      return queue.enqueue(
        knowledgeBaseId,
        targets.map((doc) => doc.id),
        { withLlm: options.withLlm === true },
      );
    },

    /** 取消某库编译：丢弃排队任务并协作式中止当前文档 */
    cancelCompile(knowledgeBaseId: string): CompileCancelResult {
      return queue.cancel(knowledgeBaseId);
    },

    /** 编译状态总览：DB 各状态计数 + 队列实时进度（内存态，可能为 null） */
    getCompileStatus(knowledgeBaseId: string): CompileStatusSnapshot {
      const docRepo = createDocumentRepository(deps.db);
      const counts: CompileStatusCounts = {
        queued: 0,
        running: 0,
        ready: 0,
        failed: 0,
        skipped: 0,
      };
      for (const doc of docRepo.listByKnowledgeBase(knowledgeBaseId)) {
        const key = (doc.compileStatus ?? 'skipped') as keyof CompileStatusCounts;
        if (key in counts) counts[key] += 1;
      }
      return { counts, progress: queue.getProgress(knowledgeBaseId) };
    },

    /** 订阅某库编译事件（SSE 通道用），返回退订函数 */
    subscribeCompile(
      knowledgeBaseId: string,
      listener: (event: CompileQueueEvent) => void,
    ): () => void {
      return queue.subscribe((event) => {
        if (event.progress.kbId === knowledgeBaseId) listener(event);
      });
    },
  };
}

export type CompileRunnerService = ReturnType<typeof createCompileRunnerService>;
export {
  createCompileQueueService,
  resetCompileQueueServiceForTest,
  type CompileQueueService,
};
