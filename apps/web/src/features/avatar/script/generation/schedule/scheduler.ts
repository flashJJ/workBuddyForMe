import type {
  PetScriptScheduleSummary,
  PetScriptStatusView,
  PetScriptTickResult,
} from '@wbfm/shared/schemas';
import {
  isScheduleDue,
  markScheduleRun,
  resolveScheduleState,
  scheduleSummary,
  setScheduleEnabled,
  type PetScriptScheduleStore,
} from './schedule';
import type { PetScriptGenerator } from '../service';
import { localDateKey } from '../state';

/**
 * P8.5：定时入口（薄壳）。
 *
 * 不持有定时器：客户端心跳调用 tick，服务端用持久化的「今日次数 + 上次时间」判到期。
 * 到期 → 记一次窗口并调用生成器；未到期/关闭直接返回当前视图，零副作用。
 */

export interface PetScriptSchedulerDeps {
  generator: PetScriptGenerator;
  store: PetScriptScheduleStore;
  now?: () => Date;
}

export interface PetScriptScheduler {
  status(): PetScriptScheduleSummary;
  view(): PetScriptStatusView;
  setEnabled(enabled: boolean): PetScriptScheduleSummary;
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
      if (!isScheduleDue(state, now())) {
        return {
          ...deps.generator.list(),
          schedule: scheduleSummary(state),
          triggered: false,
          reason: 'not-due',
          issues: [],
        };
      }

      // 先记窗口再生成：并发/失败都不会重复消费同一个窗口
      const marked = markScheduleRun(state, now());
      save(marked);
      const result = await deps.generator.generate({});
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
