import type {
  PetScriptScheduleSummary,
  PetScriptStatusView,
  PetScriptTickResult,
} from '@wbfm/shared/schemas';
import {
  isQuietHour,
  isScheduleDue,
  markScheduleRun,
  resolveScheduleState,
  scheduleSummary,
  setScheduleEnabled,
  setSchedulePerDay,
  type PetScriptScheduleStore,
  type QuietHours,
} from './schedule';
import type { PetScriptGenerator } from '../service';
import { localDateKey } from '../state';

/**
 * P8.5：定时入口（薄壳）。
 *
 * 不持有定时器：客户端每小时心跳调用 tick，服务端用持久化的「今日次数 + 上次时间」判到期。
 * 到期 → 先记一次运行再调用生成器；未到期/关闭直接返回当前视图，零副作用。
 */

export interface PetScriptSchedulerDeps {
  generator: PetScriptGenerator;
  store: PetScriptScheduleStore;
  now?: () => Date;
  /** P8.7 打扰预算：勿扰时段内不生成（不消耗当日次数） */
  quietHours?: () => QuietHours | null;
}

export interface PetScriptScheduler {
  status(): PetScriptScheduleSummary;
  view(): PetScriptStatusView;
  setEnabled(enabled: boolean): PetScriptScheduleSummary;
  setPerDay(perDay: number): PetScriptScheduleSummary;
  tick(): Promise<PetScriptTickResult>;
}

export function createPetScriptScheduler(deps: PetScriptSchedulerDeps): PetScriptScheduler {
  const now = deps.now ?? (() => new Date());

  function load() {
    return resolveScheduleState(deps.store.load(), localDateKey(now()));
  }

  function save(state: ReturnType<typeof load>): void {
    deps.store.save(state);
  }

  return {
    status: () => scheduleSummary(load()),
    view: () => ({ ...deps.generator.list(), schedule: scheduleSummary(load()) }),
    setEnabled(enabled) {
      const next = setScheduleEnabled(load(), enabled);
      save(next);
      return scheduleSummary(next);
    },
    setPerDay(perDay) {
      const next = setSchedulePerDay(load(), perDay);
      save(next);
      return scheduleSummary(next);
    },
    async tick() {
      const state = load();
      if (!state.enabled) {
        return {
          ...deps.generator.list(),
          schedule: scheduleSummary(state),
          triggered: false,
          reason: 'disabled',
          issues: [],
        };
      }
      if (isQuietHour(now().getHours(), deps.quietHours?.())) {
        return {
          ...deps.generator.list(),
          schedule: scheduleSummary(state),
          triggered: false,
          reason: 'quiet-hours',
          issues: [],
        };
      }
      if (!isScheduleDue(state, now())) {
        return {
          ...deps.generator.list(),
          schedule: scheduleSummary(state),
          triggered: false,
          reason: 'not-due',
          issues: [],
        };
      }

      // 先记一次运行再生成：并发/失败都不会在 30 分钟内重复触发
      const marked = markScheduleRun(state, now());
      save(marked);
      const result = await deps.generator.generate({ source: 'auto' });
      return {
        ...deps.generator.list(),
        schedule: scheduleSummary(marked),
        triggered: true,
        reason: result.reason,
        issues: result.issues,
      };
    },
  };
}
