import { createSettingsRepository } from '@wbfm/database';
// v1.1 M3：VoiceRuntime 领域编排已下沉 @wbfm/core/voice；web 仅保留进程单例（HMR 防护）
import { VoiceRuntime } from '@wbfm/core/voice';
import { getServices } from '../container';

/**
 * VoiceRuntime 单例：与 ServiceContainer 同样的 HMR 防护——
 * dev 下模块重新求值不能让两个引擎实例并存（模型加载昂贵且占内存）。
 * 必须在 getServices() 之后构造（设置仓储与 DB 就绪）。
 */
const globalHolder = globalThis as { __WBFM_VOICE_RUNTIME__?: VoiceRuntime };

export function getVoiceRuntime(): VoiceRuntime {
  const existing = globalHolder.__WBFM_VOICE_RUNTIME__;
  if (existing) return existing;
  const { db } = getServices();
  const runtime = new VoiceRuntime(db, createSettingsRepository(db));
  globalHolder.__WBFM_VOICE_RUNTIME__ = runtime;
  return runtime;
}

/**
 * 仅供 E2E 数据重置：单例绑定旧库，重建容器后必须丢弃，否则所有 /api/voice/*
 * 都会命中已关闭的 SQLite 连接。E2E 未下载模型，运行时内无 worker 需要回收。
 */
export function resetVoiceRuntime(): void {
  delete globalHolder.__WBFM_VOICE_RUNTIME__;
}
