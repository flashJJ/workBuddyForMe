/**
 * v3.0 剧本引擎 T0.8：dev 观测入口 `window.__petDebug`。
 *
 * 只读快照（场景 id / 活跃场景游标 / cue 日志 / seed），不提供注入与播放控制；
 * 生产构建整体不挂载。通过 getter 读取，避免每次 update 复制日志数组。
 */

import type { ActiveSceneSnapshot, CueLogEntry } from './director';
import { getBehaviorDebug, type BehaviorDebugSnapshot } from '../animation';

export interface PetScriptDebugApi {
  readonly scenes: readonly string[];
  readonly active: readonly ActiveSceneSnapshot[];
  readonly log: readonly CueLogEntry[];
  readonly seed: number;
  /** M0c：当前行为 id/阶段/轨道权重与最近 10 条过渡 */
  readonly behaviors: BehaviorDebugSnapshot | null;
  /** P3：仅 dev 的手动播放入口（干饭/被叫胖暂无触发键） */
  playScene(sceneId: string): boolean;
  /** dev 诊断：playEvent 调用次数 */
  events: number;
  /** dev 诊断：被 Director 接受（或场景存在但被门控）的次数 */
  handled: number;
  /** dev 诊断：最近一次触发键 */
  lastTrigger: string | null;
}

export interface PetScriptDebugSource {
  getActive(): readonly ActiveSceneSnapshot[];
  getLog(): readonly CueLogEntry[];
  getSeed(): number;
}

type DebugWindow = Window & { __petDebug?: PetScriptDebugApi };

/** 非生产环境挂载；返回卸载函数（生产返回 null） */
export function installPetScriptDebug(
  director: PetScriptDebugSource,
  sceneIds: readonly string[],
  playScene: (sceneId: string) => boolean = () => false,
): (() => void) | null {
  if (process.env.NODE_ENV === 'production') return null;
  const target = window as DebugWindow;
  const previous = target.__petDebug;
  const api: PetScriptDebugApi = {
    scenes: sceneIds,
    playScene,
    events: 0,
    handled: 0,
    lastTrigger: null,
    get active() {
      return director.getActive();
    },
    get log() {
      return director.getLog();
    },
    get seed() {
      return director.getSeed();
    },
    get behaviors() {
      return getBehaviorDebug();
    },
  };
  target.__petDebug = api;
  return () => {
    if (target.__petDebug === api) target.__petDebug = previous;
  };
}

/** dev 诊断入口（生产返回 null）；供 Director 接线记录触发计数 */
export function getPetScriptDebug(): PetScriptDebugApi | null {
  if (process.env.NODE_ENV === 'production') return null;
  return (window as DebugWindow).__petDebug ?? null;
}
