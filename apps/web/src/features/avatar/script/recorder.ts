/**
 * v3.0 剧本引擎 T0.2：旧 ActionChain 的黄金日志录制器。
 *
 * 把 ActionExecutor 实际执行的动作归一到「可观察 cue」，用可注入时钟打相对时间戳；
 * T0.5 起用同一层观测单元比对「旧链式行为」与「新 Scene 剧本」，允许 16ms 时间容差。
 */

import type {
  ActionChain,
  ExpressionTag,
  InteractionAction,
  InteractionKind,
  PetLinePoolId,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';

/** 归一化观测单元（旧链与新剧本共用；T0.5 的对比基准） */
export type ObservedCue =
  | { kind: 'interaction'; phase: 'start' | 'end'; interaction?: InteractionKind }
  | { kind: 'squash' }
  | { kind: 'tap' }
  | { kind: 'expression'; tag: ExpressionTag; flash: boolean; holdMs?: number }
  | { kind: 'line'; pool: PetLinePoolId; durationMs?: number }
  | { kind: 'subtitle'; i18nKey: MessageKey; durationMs?: number };

export interface RecordedCue {
  /** 相对首条记录的毫秒（由注入时钟决定，reset 后重新归零） */
  at: number;
  cue: ObservedCue;
}

/** InteractionAction → 观测单元；无表现语义的动作返回 null */
export function observeAction(action: InteractionAction): ObservedCue | null {
  switch (action.type) {
    case 'interaction.start':
      return { kind: 'interaction', phase: 'start', interaction: action.kind };
    case 'interaction.end':
      return { kind: 'interaction', phase: 'end', interaction: action.kind };
    // 旧 executor 调用 playSquash()/tap() 时未透传参数，观测层只记「发生了」
    case 'controller.playSquash':
      return { kind: 'squash' };
    case 'controller.tap':
      return { kind: 'tap' };
    case 'controller.flashExpression':
      return { kind: 'expression', tag: action.tag, flash: true, holdMs: action.durationMs };
    case 'controller.setExpression':
      return { kind: 'expression', tag: action.tag, flash: false };
    case 'subtitle.pick':
      return { kind: 'line', pool: action.pool, durationMs: action.durationMs };
    case 'subtitle.show':
      return { kind: 'subtitle', i18nKey: action.i18nKey, durationMs: action.durationMs };
  }
}

export interface CueRecorderOptions {
  /** 时钟注入：默认 performance.now；测试传 FakeClock.now */
  now?: () => number;
}

export class CueRecorder {
  private readonly entries: RecordedCue[] = [];
  private readonly now: () => number;
  private origin: number | null = null;

  constructor(options: CueRecorderOptions = {}) {
    this.now = options.now ?? (() => performance.now());
  }

  /** 录一条动作（executor 的 dispatch 逐条调用） */
  record(action: InteractionAction): void {
    const cue = observeAction(action);
    if (!cue) return;
    const now = this.now();
    if (this.origin === null) this.origin = now;
    this.entries.push({ at: Math.max(0, now - this.origin), cue });
  }

  /** 录一整条链（executor 同步顺序执行，因此同一时刻） */
  recordChain(chain: ActionChain): void {
    for (const action of chain.actions) this.record(action);
  }

  get log(): readonly RecordedCue[] {
    return this.entries;
  }

  reset(): void {
    this.entries.length = 0;
    this.origin = null;
  }
}
