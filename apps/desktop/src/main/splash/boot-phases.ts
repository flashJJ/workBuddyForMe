/**
 * v4.5 启动画面：阶段 / 模式 / 时长契约（纯函数，主进程与测试共用）。
 * 用户只看到三个阶段的文案；内部 stage 只用于日志与映射。
 */

export type BootIntro = 'full' | 'compact';

export type BootPhaseId = 'prepare' | 'server' | 'workspace';

export type BootStageId =
  | 'app-ready'
  | 'session-cleared'
  | 'cipher-ready'
  | 'server-forked'
  | 'server-healthy'
  | 'main-created'
  | 'main-ready';

export interface BootLabels {
  prepare: string;
  server: string;
  workspace: string;
  waiting: string;
  slow: string;
  verySlow: string;
  failed: string;
  failedHint: string;
  skip: string;
  version: string;
}

export interface BootTiming {
  /** 日常最小可见时间（含退场） */
  minVisibleMs: number;
  /** 首启完整片总时长上限（含首帧等待） */
  maxIntroMs: number;
}

export interface BootMode {
  intro: BootIntro;
  lang: 'zh' | 'en';
  version: string;
  labels: BootLabels;
  timing: BootTiming;
}

export interface BootPhaseEvent {
  id: BootPhaseId;
  index: 0 | 1 | 2;
  total: 3;
  atMs: number;
}

export interface BootFailure {
  message: string;
  logPath?: string;
}

export const BOOT_PHASES: readonly BootPhaseId[] = ['prepare', 'server', 'workspace'];

export const MIN_VISIBLE_MS = 500;
export const FULL_INTRO_MAX_MS = 9_000;
export const VIDEO_DURATION_MS = 8_000;

/** 内部 stage → 用户阶段 */
export function phaseForStage(stage: BootStageId): BootPhaseId {
  switch (stage) {
    case 'app-ready':
    case 'session-cleared':
    case 'cipher-ready':
      return 'prepare';
    case 'server-forked':
    case 'server-healthy':
      return 'server';
    case 'main-created':
    case 'main-ready':
      return 'workspace';
  }
}

export function createPhaseEvent(phase: BootPhaseId, atMs: number): BootPhaseEvent {
  const index = BOOT_PHASES.indexOf(phase);
  return { id: phase, index: (index < 0 ? 0 : index) as 0 | 1 | 2, total: 3, atMs };
}

/** 无 last-version 或版本变化 → 完整片；否则日常精简 */
export function introModeFor(lastVersion: string | null, currentVersion: string): 'full' | 'compact' {
  if (!lastVersion) return 'full';
  return lastVersion === currentVersion ? 'compact' : 'full';
}

export interface ExitDecision {
  mainReady: boolean;
  mode: BootIntro;
  elapsedMs: number;
  introFinished: boolean;
  minVisibleMs?: number;
  maxIntroMs?: number;
}

/** 是否允许退场并显示主窗 */
export function shouldExit(decision: ExitDecision): boolean {
  if (!decision.mainReady) return false;
  const min = decision.minVisibleMs ?? MIN_VISIBLE_MS;
  if (decision.elapsedMs < min) return false;
  if (decision.mode === 'compact') return true;
  const max = decision.maxIntroMs ?? FULL_INTRO_MAX_MS;
  return decision.introFinished || decision.elapsedMs >= max;
}
