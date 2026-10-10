import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChunkRepository,
  createCompileWriteRepository,
  createDatabase,
  createDocumentRepository,
  createKnowledgeRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { createCompileRunnerService } from './compile-runner-service';
import {
  createCompileQueueService,
  resetCompileQueueServiceForTest,
  type CompileQueueEvent,
} from './compile-queue-service';

function depsFor(db: DatabaseInstance): ServiceDeps {
  return { db } as unknown as ServiceDeps;
}

/** 单分片可编译文档（规则通道零模型调用：裸 deps 无任何 provider） */
function seedDoc(
  db: DatabaseInstance,
  kbId: string,
  filename: string,
  content = 'Qwen2.5 是一个对话模型。Qwen2.5 兼容 OpenAI 接口，支持流式输出。',
): string {
  const docId = createDocumentRepository(db)
    .create({
      knowledgeBaseId: kbId,
      filename,
      fileType: '.txt',
      byteSize: 1,
      contentHash: `hash-${filename}`,
    }).id;
  createChunkRepository(db).bulkInsert(docId, [
    { ordinal: 0, content, charStart: 0, charEnd: content.length, pageNo: 1, paragraphNo: 1 },
  ]);
  // 同步 documents.chunk_count（scope=all 以该字段筛目标）
  createDocumentRepository(db).setStatus(docId, 'indexed', { chunkCount: 1 });
  return docId;
}

describe('编译后台队列（v1.3 M4）', () => {
  let db: DatabaseInstance;
  let kbId: string;

  beforeEach(() => {
    resetCompileQueueServiceForTest();
    db = createDatabase(':memory:');
    kbId = createKnowledgeRepository(db).create({
      name: '库',
      chunkSize: 200,
      chunkOverlap: 10,
    }).id;
  });

  afterEach(() => {
    db.close();
  });

  it('串行编译：两个文档依次 ready，事件以 idle 收尾（规则通道零模型调用）', async () => {
    const docA = seedDoc(db, kbId, 'a.txt');
    const docB = seedDoc(db, kbId, 'b.txt');
    const events: CompileQueueEvent[] = [];
    const queue = createCompileQueueService(depsFor(db));
    queue.subscribe((event) => events.push(event));

    expect(queue.enqueue(kbId, [docA, docB])).toEqual({ queued: 2, skipped: 0 });

    const docRepo = createDocumentRepository(db);
    await vi.waitFor(() => {
      expect(docRepo.findById(docA)!.compileStatus).toBe('ready');
      expect(docRepo.findById(docB)!.compileStatus).toBe('ready');
    });

    // 首拍为入队快照（尚未起跑），第二拍为任务开跑
    expect(events[0]).toMatchObject({
      type: 'progress',
      progress: { total: 2, running: false, currentDocumentId: null, done: 0 },
    });
    expect(events[1]).toMatchObject({
      type: 'progress',
      progress: { total: 2, running: true, currentDocumentId: docA, done: 0 },
    });
    const last = events[events.length - 1]!;
    expect(last.type).toBe('idle');
    expect(last.type === 'idle' && last.progress).toMatchObject({
      done: 2,
      failed: 0,
      total: 2,
      running: false,
      currentDocumentId: null,
    });
  });

  it('重复入队去重：执行中与排队中的文档跳过', async () => {
    const docA = seedDoc(db, kbId, 'a.txt');
    const docB = seedDoc(db, kbId, 'b.txt');
    const queue = createCompileQueueService(depsFor(db));

    expect(queue.enqueue(kbId, [docA])).toEqual({ queued: 1, skipped: 0 });
    // docA 已在执行（同步起跑）→ 跳过；docB 正常入队
    expect(queue.enqueue(kbId, [docA, docB])).toEqual({ queued: 1, skipped: 1 });

    const docRepo = createDocumentRepository(db);
    await vi.waitFor(() => {
      expect(docRepo.findById(docA)!.compileStatus).toBe('ready');
      expect(docRepo.findById(docB)!.compileStatus).toBe('ready');
    });
    // docB 只编译一次：进度 total=2（首轮 1 + 补投 1），无重复世代推进
    expect(queue.getProgress(kbId)).toMatchObject({ done: 2, total: 2, failed: 0 });
  });

  it('取消：丢弃排队任务并从进度中扣减；已开跑文档不受影响', async () => {
    const docA = seedDoc(db, kbId, 'a.txt');
    const docB = seedDoc(db, kbId, 'b.txt');
    const queue = createCompileQueueService(depsFor(db));
    queue.enqueue(kbId, [docA, docB]);

    expect(queue.cancel(kbId)).toEqual({ dropped: 1, aborted: true });

    const docRepo = createDocumentRepository(db);
    await vi.waitFor(() => {
      expect(queue.getProgress(kbId)).toMatchObject({ done: 1, total: 1, running: false });
    });
    expect(docRepo.findById(docA)!.compileStatus).toBe('ready');
    // 被丢弃的 docB 从未执行：保持原状态（未编译文档默认 skipped）待手动重试
    expect(docRepo.findById(docB)!.compileStatus).toBe('skipped');
  });

  it('getCompileStatus：DB 计数为真源，进度为队列内存态', async () => {
    const docA = seedDoc(db, kbId, 'a.txt');
    const docB = seedDoc(db, kbId, 'b.txt');
    const runner = createCompileRunnerService(depsFor(db));

    const before = runner.getCompileStatus(kbId);
    expect(before.counts).toEqual({ queued: 0, running: 0, ready: 0, failed: 0, skipped: 2 });
    expect(before.progress).toBeNull();

    runner.compileKnowledgeBase(kbId, { scope: 'all' });
    await vi.waitFor(() => {
      expect(runner.getCompileStatus(kbId).counts.ready).toBe(2);
    });
    const after = runner.getCompileStatus(kbId);
    expect(after.counts.ready).toBe(2);
    expect(after.progress).toMatchObject({ done: 2, total: 2, running: false });
  });

  it('runner scope=new 含 failed 重试入口', async () => {
    const docA = seedDoc(db, kbId, 'a.txt');
    createCompileWriteRepository(db).updateCompileStatus(docA, 'failed', { error: 'boom' });

    const runner = createCompileRunnerService(depsFor(db));
    expect(runner.compileKnowledgeBase(kbId, { scope: 'new' }).queued).toBe(1);

    const docRepo = createDocumentRepository(db);
    await vi.waitFor(() => {
      expect(docRepo.findById(docA)!.compileStatus).toBe('ready');
    });
  });
});
