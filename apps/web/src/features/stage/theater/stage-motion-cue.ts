/**
 * 舞台动作 cue：由剧场剧本映射，交给角色控制器执行。
 * 只描述「做什么动作」，不含控制器与 React 依赖。
 */
export type StageMotionCue =
  | { kind: 'motion'; id: string; fadeMs?: number }
  | { kind: 'behavior'; id: string };
