import { Worker } from 'node:worker_threads';
import type { TtsEngine, TtsResult, TtsSynthOptions } from '../types';
import { VoiceEngineError } from '../types';
import { isSpeakableText } from '../../text/sentence-splitter';
import type { SherpaTtsOptions } from './tts-engine';
import { buildNativeTtsConfig } from './tts-native-config';
import { TTS_WORKER_SOURCE } from './tts-worker-source';

/** 首帧就绪等待上限：Kokoro 冷加载在低配机可达十余秒 */
const READY_TIMEOUT_MS = 30_000;
/** dispose 等待 worker 自行退出的上限，超时直接 terminate */
const EXIT_TIMEOUT_MS = 3_000;

/** Worker 的最小结构面（测试可注入假实现） */
export interface TtsWorkerLike {
  on(event: 'message', listener: (msg: unknown) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  postMessage(value: unknown, transferList?: readonly ArrayBuffer[]): void;
  terminate(): Promise<number> | number;
  unref(): void;
}

export interface WorkerTtsOptions extends SherpaTtsOptions {
  /** sherpa-onnx-node 的绝对入口，由 resolveSherpaModulePath 解析 */
  modulePath: string;
  /** 测试注入：替换真实 Worker 构造 */
  workerFactory?: (
    source: string,
    options: { eval: true; execArgv: string[]; workerData: unknown },
  ) => TtsWorkerLike;
}

type ReadyInfo = { sampleRate: number; numSpeakers: number };

/**
 * 把 sherpa-onnx 合成搬进 worker 线程的 TtsEngine 实现。
 *
 * 主线程只做文本过滤与消息收发：原生推理再慢也不会阻塞 SSE 事件循环与
 * 模型流式输出（对话朗读默认走此实现，失败由工厂回退 inline）。
 */
export class WorkerTtsEngine implements TtsEngine {
  private nextId = 1;
  private disposed = false;
  private readonly pending = new Map<
    number,
    { resolve: (r: TtsResult) => void; reject: (e: Error) => void }
  >();

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

    const ready = await waitReady(worker);
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
      this.pending.delete(msg.id);
      if (msg.type === 'audio') {
        pending.resolve({
          samples: msg.samples ?? new Float32Array(0),
          sampleRate: msg.sampleRate ?? this.ready.sampleRate,
        });
      } else if (msg.type === 'error') {
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

  async synthesize(text: string, opts?: TtsSynthOptions): Promise<TtsResult> {
    const trimmed = text.trim();
    // 与 inline 引擎同规：空串/纯标点不进原生层（MeloTTS 会硬失败）
    if (!trimmed || !isSpeakableText(trimmed)) {
      return { samples: new Float32Array(0), sampleRate: this.ready.sampleRate };
    }
    if (this.disposed) {
      throw new VoiceEngineError('tts', 'TTS worker 已释放', '重新打开朗读或重启应用');
    }
    const requested = opts?.speakerId ?? this.speakerId;
    const sid = requested < this.ready.numSpeakers ? requested : this.speakerId;
    const id = this.nextId++;

    return new Promise<TtsResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ type: 'synth', id, text: trimmed, sid, speed: this.speed });
      } catch (error) {
        this.pending.delete(id);
        reject(new VoiceEngineError('tts', `TTS worker 通信失败：${(error as Error).message}`));
      }
    });
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
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }
}

/** 等待 worker 报就绪；超时、致命错误或提前退出都转为可读的 VoiceEngineError */
function waitReady(worker: TtsWorkerLike): Promise<ReadyInfo> {
  return new Promise<ReadyInfo>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new VoiceEngineError('tts', 'TTS worker 启动超时'))),
      READY_TIMEOUT_MS,
    );
    worker.on('message', (raw) => {
      const msg = raw as { type?: string; message?: string; sampleRate?: number; numSpeakers?: number };
      if (msg.type === 'ready') {
        finish(() =>
          resolve({ sampleRate: msg.sampleRate ?? 24_000, numSpeakers: msg.numSpeakers ?? 1 }),
        );
      } else if (msg.type === 'fatal') {
        finish(() => reject(new VoiceEngineError('tts', `TTS worker 初始化失败：${msg.message}`)));
      }
    });
    worker.on('error', (error) =>
      finish(() => reject(new VoiceEngineError('tts', `TTS worker 崩溃：${error.message}`))),
    );
    worker.on('exit', (code) =>
      finish(() => reject(new VoiceEngineError('tts', `TTS worker 提前退出（code=${code}）`))),
    );
  });
}

/**
 * 解析 sherpa-onnx-node 的绝对入口，供 worker 内 require。
 *
 * 以服务端入口脚本（standalone 的 server.js / next dev 的进程入口）为解析基点，
 * 逐级向上能找到 resources/server/node_modules 或仓库根 node_modules；
 * 都失败时返回 null，由调用方回退主线程引擎。
 */
export { resolveSherpaModulePath } from './tts-worker-source';
