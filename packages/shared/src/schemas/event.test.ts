import { describe, expect, it } from 'vitest';
import {
  EVENT_MAX_BRANCHES,
  EVENT_MAX_STEPS,
  EVENT_WAIT_MAX_MS,
  eventDefinitionSchema,
  eventStepSchema,
  type EventDefinition,
  type EventStep,
} from './event';

const expr = (over: Partial<EventStep> = {}): EventStep =>
  ({ kind: 'expression', tag: 'joy', ...over }) as EventStep;

function makeDef(steps: EventStep[], over: Partial<EventDefinition> = {}): EventDefinition {
  return {
    id: 'ev.greeting.morning',
    titleKey: 'event.greeting.morning.title',
    priority: 1,
    interruptPolicy: 'ignore',
    cooldownMs: 60_000,
    speechLock: 'queue',
    steps,
    ...over,
  };
}

describe('event schema（v1.7 M1）', () => {
  it('合法剧本通过', () => {
    const def = makeDef([
      expr(),
      { kind: 'speech', lineKey: 'event.x.y0' },
      { kind: 'wait', ms: 500 },
      { kind: 'branch', when: [{ path: 'relation.intimacy', op: 'gte', value: 30 }], goto: 6 },
      { kind: 'fx', id: 'hearts' },
      { kind: 'spatial', action: 'hop' },
      { kind: 'motion', group: 'tap' },
      { kind: 'gaze', x: 0.5, y: -1 },
    ]);
    expect(eventDefinitionSchema.parse(def).steps).toHaveLength(8);
  });

  it('拒绝非法 id 前缀', () => {
    expect(eventDefinitionSchema.safeParse(makeDef([expr()], { id: 'x.y' })).success).toBe(false);
    expect(eventDefinitionSchema.safeParse(makeDef([expr()], { id: 'evil.foo' })).success).toBe(false);
  });

  it('拒绝 branch 回跳/自跳（禁止循环）', () => {
    const def = makeDef([
      expr(),
      { kind: 'branch', when: [], goto: 1 },
      expr(),
    ]);
    expect(eventDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it('拒绝 branch 越界', () => {
    const def = makeDef([{ kind: 'branch', when: [], goto: 5 }]);
    expect(eventDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it(`单剧本 branch 不得超过 ${EVENT_MAX_BRANCHES}`, () => {
    const steps: EventStep[] = [expr()];
    for (let i = 0; i < EVENT_MAX_BRANCHES + 1; i++) steps.push({ kind: 'branch', when: [], goto: 7 });
    for (let i = 0; i < 2; i++) steps.push(expr());
    expect(eventDefinitionSchema.safeParse(makeDef(steps)).success).toBe(false);
  });

  it('steps 数量上下限', () => {
    expect(eventDefinitionSchema.safeParse(makeDef([])).success).toBe(false);
    const tooMany = Array.from({ length: EVENT_MAX_STEPS + 1 }, () => expr());
    expect(eventDefinitionSchema.safeParse(makeDef(tooMany)).success).toBe(false);
  });

  it('各 step 字段边界：wait/gaze/未知 fx 与 motion 组', () => {
    expect(eventStepSchema.safeParse({ kind: 'wait', ms: EVENT_WAIT_MAX_MS + 1 }).success).toBe(false);
    expect(eventStepSchema.safeParse({ kind: 'gaze', x: 1.1, y: 0 }).success).toBe(false);
    expect(eventStepSchema.safeParse({ kind: 'fx', id: 'boom' }).success).toBe(false);
    expect(eventStepSchema.safeParse({ kind: 'motion', group: 'idle' }).success).toBe(false);
    expect(eventStepSchema.safeParse({ kind: 'spatial', action: 'fly' }).success).toBe(false);
  });

  it('条件 path 只收点分合法标识符', () => {
    const ok = { kind: 'branch' as const, when: [{ path: 'counters.touch_streak', op: 'gte' as const, value: 3 }], goto: 2 };
    expect(eventStepSchema.safeParse(ok).success).toBe(true);
    expect(
      eventStepSchema.safeParse({ ...ok, when: [{ ...ok.when[0]!, path: 'mood.x(); rm' }] }).success,
    ).toBe(false);
  });

  it('speech 台词：lineKey 与 text 恰有其一', () => {
    expect(eventStepSchema.parse({ kind: 'speech', lineKey: 'a' })).not.toHaveProperty('tts');
    expect(eventStepSchema.safeParse({ kind: 'speech', lineKey: '' }).success).toBe(false);
    const textStep = eventStepSchema.parse({ kind: 'speech', text: '晚安' });
    expect('text' in textStep ? textStep.text : null).toBe('晚安');
    expect(
      eventDefinitionSchema.safeParse(makeDef([{ kind: 'speech', lineKey: 'a', text: 'b' }])).success,
    ).toBe(false);
    expect(eventDefinitionSchema.safeParse(makeDef([{ kind: 'speech' } as EventStep])).success).toBe(
      false,
    );
  });

  it('标题：titleKey 与 title 恰有其一', () => {
    expect(
      eventDefinitionSchema.safeParse(makeDef([expr()], { titleKey: undefined, title: '晚安小仪式' }))
        .success,
    ).toBe(true);
    expect(eventDefinitionSchema.safeParse(makeDef([expr()], { title: '重复标题' })).success).toBe(
      false,
    );
    expect(
      eventDefinitionSchema.safeParse(makeDef([expr()], { titleKey: undefined, title: undefined }))
        .success,
    ).toBe(false);
  });
});
