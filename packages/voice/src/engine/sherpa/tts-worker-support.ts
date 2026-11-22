import type { TtsChunkSink, TtsResult } from '../types';
import { VoiceEngineError } from '../types';

/** Worker 的最小结构面（测试可注入假实现） */
export interface TtsWorkerLike {
  on(event: 'message', listener: (msg: unknown) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  postMessage(value: unknown, transferList?: readonly ArrayBuffer[]): void;
  terminate(): Promise<number> | number;
  unref(): void;
}

export type ReadyInfo = { sampleRate: number; numSpeakers: number };

export interface PendingSynth {
  resolve: (r: TtsResult) => void;
  reject: (e: Error) => void;
  /** 已回传的增量 PCM（按到达顺序） */
  chunks: Float32Array[];
  sink?: TtsChunkSink;
  /** 取消监听清理（signal 场景） */
  cleanup?: () => void;
}

/** 等待 worker 报就绪；超时、致命错误或提前退出都转为可读的 VoiceEngineError */
export function waitReady(worker: TtsWorkerLike, timeoutMs: number): Promise<ReadyInfo> {
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
      timeoutMs,
    );
    worker.on('message', (raw) => {
      const msg = raw as {
        type?: string;
        message?: string;
        sampleRate?: number;
        numSpeakers?: number;
      };
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

/** 按到达顺序拼回完整 PCM（单块时零拷贝返回） */
export function concatChunks(chunks: Array<Float32Array>): Float32Array {
  if (chunks.length === 0) return new Float32Array(0);
  if (chunks.length === 1) return chunks[0]!;
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
