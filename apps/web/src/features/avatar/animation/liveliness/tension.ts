/**
 * 自然度层的张力上游：把交互状态映射成 tension（0 放松 / 1 用力）。
 *
 * 单独成文件保持纯函数，控制器每帧只做「取目标 → 平滑跟随」。
 * 优先级从高到低：睡眠 → 被拎起 → 触摸/按压 → L3 行为 → 说话 → 背对 → 待机。
 */

export interface LivelinessState {
  /** 10min 无交互入睡 */
  sleeping?: boolean;
  /** 被拎起 / 悬空 */
  raised?: boolean;
  /** 点击反应或按住交互（press/loop/end 阶段） */
  touching?: boolean;
  /** L3 分层行为进行中 */
  behavior?: boolean;
  /** 语音输出 */
  speaking?: boolean;
  /** 久无交互背对 */
  faceAway?: boolean;
}

/** 各状态的目标张力；值越大呼吸越浅、微扰越小、越对称 */
export const TENSION = {
  sleeping: 0.05,
  raised: 0.85,
  touching: 0.6,
  behavior: 0.45,
  speaking: 0.3,
  faceAway: 0.2,
  idle: 0.15,
} as const;

export function tensionTarget(state: LivelinessState): number {
  if (state.sleeping) return TENSION.sleeping;
  if (state.raised) return TENSION.raised;
  if (state.touching) return TENSION.touching;
  if (state.behavior) return TENSION.behavior;
  if (state.speaking) return TENSION.speaking;
  if (state.faceAway) return TENSION.faceAway;
  return TENSION.idle;
}

/** 指数趋近目标：状态切换时张力不跳变（tau 秒后误差约 37%） */
export function dampTension(current: number, target: number, dt: number, tau = 0.35): number {
  if (!(dt > 0)) return current;
  if (!(tau > 0)) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
