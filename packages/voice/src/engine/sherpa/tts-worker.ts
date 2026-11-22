import { Worker } from 'node:worker_threads';
import type { TtsChunkSink, TtsEngine, TtsResult, TtsSynthOptions } from '../types';
import { VoiceEngineError } from '../types';
import { isSpeakableText } from '../../text/sentence-splitter';
import type { SherpaTtsOptions } from './tts-engine';
import { buildNativeTtsConfig } from './tts-native-config';
import { TTS_WORKER_SOURCE } from './tts-worker-source';
import {
  concatChunks,
  waitReady,
  type PendingSynth,
  type ReadyInfo,
  type TtsWorkerLike,
} from './tts-worker-support';

export type { TtsWorkerLike } from './tts-worker-support';

/** 首帧就绪等待上限：Kokoro 冷加载在低配机可达十余秒 */
const READY_TIMEOUT_MS = 30_000;
/** dispose 等待 worker 自行退出的上限，超时直接 terminate */
const EXIT_TIMEOUT_MS = 3_000;

export interface WorkerTtsOptions extends SherpaTtsOptions {
  /** sherpa-onnx-node 的绝对入口，由 resolveSherpaModulePath 解析 */
  modulePath: string;
  /** 测试注入：替换真实 Worker 构造 */
  workerFactory?: (
    source: string,
    options: { eval: true; execArgv: string[]; workerData: unknown },
  ) => TtsWorkerLike;
}

/**
 * 把 sherpa-onnx 合成搬进 worker 线程的 TtsEngine 实现。
 *
 * 主线程只做文本过滤与消息收发：原生推理再慢也不会阻塞 SSE 事件循环与
 * 模型流式输出（对话朗读默认走此实现，失败由工厂回退 inline）。
 */
export class WorkerTtsEngine implements TtsEngine {
  private nextId = 1;
  private disposed = false;
  private readonly pending = new Map<number, PendingSynth>();

  private constructor(
    private readonly worker: TtsWorkerLike,
    private readonly ready: ReadyInfo,
    private readonly speakerId: number,
    private readonly speed: number,
  ) {}

  static async create(options: WorkerTtsOptions): Promise<WorkerTtsEngine> {
    const { config, spec, exists } = options;
    const fsExists =
      exists ??
      ((p: string) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs') as typeof import('node:fs');
        return fs.existsSync(p);
      });
    const built = buildNativeTtsConfig({ config, spec, ruleFsts: options.ruleFsts, exists: fsExists });

    const factory =
      options.workerFactory ??
      ((source, opts) => new Worker(source, opts) as unknown as TtsWorkerLike);
    const worker = factory(TTS_WORKER_SOURCE, {
      eval: true,
      // 强制清空：standalone 进程带 --require cipher 引导，继承会造成 worker 再跑一遍
      execArgv: [],
      workerData: { modulePath: options.modulePath, config: built.nativeConfig },
    });
    // 不阻止进程退出：worker 常驻但由引擎生命周期管理
    worker.unref();

    let ready: ReadyInfo;
    try {
      ready = await waitReady(worker, READY_TIMEOUT_MS);
    } catch (error) {
      // 就绪失败（超时/初始化 fatal）时 worker 可能仍在加载模型：
      // 不终止的话每次重试都会在进程里多留一个常驻线程与一份模型内存
      try {
        await worker.terminate();
      } catch {
        /* 已退出 */
      }
      throw error;
    }
    const speakerCount = ready.numSpeakers;
    const requested = config.speakerId ?? 0;
    const speakerId = requested < speakerCount ? requested : 0;
    if (requested !== speakerId) {
      console.warn(
        `[voice:tts] 请求 sid=${requested} 超出模型说话人数 ${speakerCount}，回落 sid=0`,
      );
    }
    return new WorkerTtsEngine(worker, ready, speakerId, config.speed ?? 1).attach();
  }

  /** 挂上合成分发与异常收敛（就绪握手完成后才接管消息） */
  private attach(): this {
    this.worker.on('message', (raw) => {
      const msg = raw as {
        type?: string;
        id?: number;
        samples?: Float32Array;
        sampleRate?: number;
        message?: string;
      };
      if (typeof msg.id !== 'number') return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      const sampleRate = msg.sampleRate ?? this.ready.sampleRate;
      if (msg.type === 'audio_chunk') {
        const samples = msg.samples ?? new Float32Array(0);
        if (samples.length === 0) return;
        pending.chunks.push(samples);
        try {
          if (pending.sink?.({ samples, sampleRate }) === false) {
            // 消费端主动要求停止：通知 worker 在下一个块边界退出
            this.worker.postMessage({ type: 'abort', id: msg.id });
            this.finish(msg.id, pending);
            pending.reject(new VoiceEngineError('tts', '合成已取消'));
          }
        } catch {
          /* sink 异常不阻断合成 */
        }
        return;
      }
      if (msg.type === 'audio') {
        // 兼容旧 worker 消息（整段回传）
        const samples = msg.samples ?? new Float32Array(0);
        if (samples.length > 0) pending.chunks.push(samples);
        this.finish(msg.id, pending, samples, sampleRate);
        return;
      }
      if (msg.type === 'audio_done') {
        const tail = msg.samples ?? new Float32Array(0);
        if (tail.length > 0) {
          pending.chunks.push(tail);
          try {
            pending.sink?.({ samples: tail, sampleRate });
          } catch {
            /* sink 异常不阻断合成 */
          }
        }
        this.finish(msg.id, pending, tail, sampleRate);
        return;
      }
      if (msg.type === 'error') {
        this.finish(msg.id, pending);
        pending.reject(new VoiceEngineError('tts', `TTS 合成失败：${msg.message}`));
      }
    });
    this.worker.on('error', (error) => {
      this.rejectAll(new VoiceEngineError('tts', `TTS worker 崩溃：${error.message}`));
    });
    this.worker.on('exit', (code) => {
      this.disposed = true;
      this.rejectAll(new VoiceEngineError('tts', `TTS worker 已退出（code=${code}）`));
    });
    return this;
  }

  synthesize(text: string, opts?: TtsSynthOptions): Promise<TtsResult> {
    return this.synthesizeStream(text, opts, () => undefined);
  }

  async synthesizeStream(
    text: string,
    opts: TtsSynthOptions | undefined,
    sink: TtsChunkSink,
  ): Promise<TtsResult> {
    const trimmed = text.trim();
    // 与 inline 引擎同规：空串/纯标点不进原生层（MeloTTS 会硬失败）
    if (!trimmed || !isSpeakableText(trimmed)) {
      const empty = { samples: new Float32Array(0), sampleRate: this.ready.sampleRate };
      sink(empty);
      return empty;
    }
    if (this.disposed) {
      throw new VoiceEngineError('tts', 'TTS worker 已释放', '重新打开朗读或重启应用');
    }
    if (opts?.signal?.aborted) {
      throw new VoiceEngineError('tts', '合成已取消');
    }
    const requested = opts?.speakerId ?? this.speakerId;
    const sid = requested < this.ready.numSpeakers ? requested : this.speakerId;
    const id = this.nextId++;

    return new Promise<TtsResult>((resolve, reject) => {
      const pending: PendingSynth = { resolve, reject, chunks: [], sink };
      this.pending.set(id, pending);
      if (opts?.signal) {
        const onAbort = () => {
          try {
            this.worker.postMessage({ type: 'abort', id });
          } catch {
            /* worker 已退出 */
          }
          if (this.pending.get(id) === pending) {
            this.finish(id, pending);
            reject(new VoiceEngineError('tts', '合成已取消'));
          }
        };
        opts.signal.addEventListener('abort', onAbort, { once: true });
        pending.cleanup = () => opts.signal?.removeEventListener('abort', onAbort);
      }
      try {
        this.worker.postMessage({
          type: 'synth',
          id,
          text: trimmed,
          sid,
          speed: opts?.speed ?? this.speed,
        });
      } catch (error) {
        this.finish(id, pending);
        reject(new VoiceEngineError('tts', `TTS worker 通信失败：${(error as Error).message}`));
      }
    });
  }

  /** 清掉 pending 并解除 signal 监听（resolve/reject 由调用点决定） */
  private finish(id: number, pending: PendingSynth, tail?: Float32Array, sampleRate?: number): void {
    this.pending.delete(id);
    pending.cleanup?.();
    if (tail !== undefined) {
      pending.resolve({
        samples: concatChunks(pending.chunks),
        sampleRate: sampleRate ?? this.ready.sampleRate,
      });
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.rejectAll(new VoiceEngineError('tts', 'TTS worker 已释放'));
    try {
      this.worker.postMessage({ type: 'shutdown' });
    } catch {
      /* 已退出 */
    }

    let exited = false;
    const exitPromise = new Promise<void>((resolve) =>
      this.worker.on('exit', () => {
        exited = true;
        resolve();
      }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, EXIT_TIMEOUT_MS);
    });
    await Promise.race([exitPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    if (!exited) {
      await Promise.resolve(this.worker.terminate()).catch(() => undefined);
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.cleanup?.();
      pending.reject(error);
    }
    this.pending.clear();
  }
}

/**
 * 解析 sherpa-onnx-node 的绝对入口，供 worker 内 require。
 *
 * 以服务端入口脚本（standalone 的 server.js / next dev 的进程入口）为解析基点，
 * 逐级向上能找到 resources/server/node_modules 或仓库根 node_modules；
 * 都失败时返回 null，由调用方回退主线程引擎。
 */
export { resolveSherpaModulePath } from './tts-worker-source';
