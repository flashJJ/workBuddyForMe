/**
 * EventDirector 单测公共桩（非生产代码）：
 * 可控假 runner + 可变 gates + 固定日界的内存用量仓储。
 */
import { eventDefinitionSchema, type EventDefinition, type EventEndReason, type EventRunOutcome } from '@wbfm/shared/schemas';
import { EventDirector, InMemoryEventUsageStore, createManualClock } from './index';
import type { ConditionContext, DirectorSettings } from './index';
import type { EventRunner } from './runner';

export function makeContext(over: Partial<ConditionContext['time']> = {}): ConditionContext {
  return {
    mood: { happiness: 0, anger: 0, sadness: 0 },
    relation: { intimacy: 10, trust: 5 },
    personality: { frankness: 0.5, tsundere: 0.2, shy: 0.2, tolerance: 0.5 },
    counters: {},
    time: { hour: 12, lastInteractionMin: 3, ...over },
  };
}

export function makeDef(over: Partial<EventDefinition> & { id: string }): EventDefinition {
  return eventDefinitionSchema.parse({
    titleKey: 'event.test.title',
    priority: 1,
    interruptPolicy: 'ignore',
    cooldownMs: 60_000,
    speechLock: 'queue',
    steps: [{ kind: 'expression', tag: 'neutral' }],
    ...over,
  });
}

/** 只实现 director 使用面（eventId/interrupt/done）的假 runner */
export class TestRunner {
  readonly eventId: string;
  readonly interrupts: EventEndReason[] = [];
  private resolveDone!: (r: { eventId: string; outcome: EventRunOutcome; reason?: string }) => void;
  private readonly donePromise: Promise<{ eventId: string; outcome: EventRunOutcome; reason?: string }> =
    new Promise((resolve) => {
      this.resolveDone = resolve;
    });

  constructor(readonly def: EventDefinition) {
    this.eventId = def.id;
  }

  interrupt(reason: EventEndReason): void {
    this.interrupts.push(reason);
  }

  /** 真实 EventRunner.skip 即 interrupt('user_skip')，桩保持同语义 */
  skip(): void {
    this.interrupt('user_skip');
  }

  done() {
    return this.donePromise as Promise<{ eventId: string; outcome: EventRunOutcome; reason?: string }>;
  }

  settle(outcome: 'played' | 'skipped' | 'interrupted' = 'played', reason?: string): void {
    this.resolveDone({ eventId: this.eventId, outcome, reason });
  }
}

export interface DirectorHarness {
  director: EventDirector;
  usage: InMemoryEventUsageStore;
  gates: { conv: boolean; tts: boolean; outlet: boolean };
  runners: TestRunner[];
  createdFor: string[];
  flush(): Promise<void>;
}

export function makeDirectorHarness(settings?: Partial<DirectorSettings>): DirectorHarness {
  const gatesState = { conv: false, tts: false, outlet: true };
  const clock = createManualClock(1_000_000);
  const usage = new InMemoryEventUsageStore({ toDateKey: () => '2026-10-13' });
  const runners: TestRunner[] = [];
  const createdFor: string[] = [];
  const director = new EventDirector({
    gates: {
      isConvLocked: () => gatesState.conv,
      isTtsLocked: () => gatesState.tts,
      hasOutlet: () => gatesState.outlet,
    },
    clock,
    sink: {} as never,
    usage,
    toDateKey: () => '2026-10-13',
    settings: { masterEnabled: true, quietStart: 23, quietEnd: 8, tier: 'standard', ...settings },
    runnerFactory: (d) => {
      const r = new TestRunner(d);
      runners.push(r);
      createdFor.push(d.id);
      return r as unknown as EventRunner;
    },
  });
  return {
    director,
    usage,
    gates: gatesState,
    runners,
    createdFor,
    flush: async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    },
  };
}
