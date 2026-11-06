import type { TtsEngine } from '../types';
import { SherpaTtsEngine, type SherpaTtsOptions } from './tts-engine';
import {
  WorkerTtsEngine,
  resolveSherpaModulePath,
  type TtsWorkerLike,
} from './tts-worker';

export type TtsEngineMode = 'inline' | 'worker';

export interface CreateTtsEngineOptions extends SherpaTtsOptions {
  /** 'worker'（默认）：合成离开主线程；worker 初始化失败自动回退 inline */
  mode?: TtsEngineMode;
  /** 测试注入：覆盖 sherpa-onnx-node 入口解析结果（null 表示解析失败） */
  modulePath?: string | null;
  /** 测试注入：替换真实 Worker 构造 */
  workerFactory?: (
    source: string,
    options: { eval: true; execArgv: string[]; workerData: unknown },
  ) => TtsWorkerLike;
}

/**
 * 构造 TTS 引擎：对话链路默认走 worker 线程。
 *
 * 原生推理是同步调用，留在主线程会阻塞 SSE 事件循环与模型流式输出
 * （实测开启朗读后 10s 的应答被拖到一分钟量级）。worker 不可用时回退
 * 主线程实现，保证朗读功能本身不因线程化失败而不可用。
 */
export async function createSherpaTtsEngine(
  options: CreateTtsEngineOptions,
): Promise<TtsEngine> {
  if ((options.mode ?? 'worker') === 'inline') {
    return SherpaTtsEngine.create(options);
  }

  const modulePath =
    options.modulePath === undefined ? resolveSherpaModulePath() : options.modulePath;
  if (!modulePath) {
    console.warn('[voice:tts] 未解析到 sherpa-onnx-node 入口，回退主线程合成');
    return SherpaTtsEngine.create(options);
  }

  try {
    return await WorkerTtsEngine.create({ ...options, modulePath });
  } catch (error) {
    console.warn(
      '[voice:tts] worker 引擎不可用，回退主线程合成：',
      (error as Error).message,
    );
    return SherpaTtsEngine.create(options);
  }
}
