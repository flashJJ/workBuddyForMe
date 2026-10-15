import { describe, expect, it } from 'vitest';
import {
  applyRelationshipEvent,
  defaultRelationshipBlock,
  displayLevelOf,
  evaluateFloorAtCheckpoint,
  isRelationshipUnlocked,
  levelFromScore,
  levelScoreOf,
  normalizeRelationshipBlock,
} from './relationship-kernel';

const R = (intimacy: number, trust: number) => ({ intimacy, trust });

describe('v2.0 关系等级内核（03 契约）', () => {
  it('复合分：初始 20/30 → 24.0，落陌生（0 档）', () => {
    expect(levelScoreOf(R(20, 30))).toBe(24);
    expect(levelFromScore(24, 30)).toBe(0);
    expect(displayLevelOf(defaultRelationshipBlock(), R(20, 30))).toBe(0);
  });

  it('分数阈值边界 25/50/75', () => {
    expect(levelFromScore(24.9, 30)).toBe(0);
    expect(levelFromScore(25, 30)).toBe(1);
    expect(levelFromScore(49.9, 30)).toBe(1);
    expect(levelFromScore(50, 30)).toBe(2);
    expect(levelFromScore(74.9, 60)).toBe(2);
    expect(levelFromScore(75, 60)).toBe(3);
  });

  it('挚友双门槛四组：trust 不够再高的亲密也只到搭档', () => {
    expect(levelFromScore(75, 59)).toBe(2); // 卡 trust
    expect(levelFromScore(75, 60)).toBe(3);
    expect(levelFromScore(74, 60)).toBe(2); // 卡分数
    expect(levelFromScore(100, 60)).toBe(3);
    expect(levelFromScore(100, 100)).toBe(3);
  });

  it('普通聊天每轮 +0.19 复合分：约 6 轮从陌生升认识', () => {
    let block = defaultRelationshipBlock();
    let relation = R(20, 30);
    let levelUps = 0;
    for (let i = 0; i < 6; i++) {
      const out = applyRelationshipEvent(block, relation, R(0.25, 0.1), '2026-10-15');
      block = out.block;
      relation = out.relation;
      levelUps += out.events.length;
    }
    expect(displayLevelOf(block, relation)).toBe(1);
    expect(levelUps).toBe(1);
  });

  it('日增量上限：intimacy +6/日、trust +3/日后截断，事件仍演算但数值不增', () => {
    let block = defaultRelationshipBlock();
    let relation = R(20, 30);
    // praise 增量 +2/+1：4 次后 trust 已达 +4 但只给 +3
    const grants: Array<[number, number]> = [];
    for (let i = 0; i < 4; i++) {
      const out = applyRelationshipEvent(block, relation, R(2, 1), '2026-10-15');
      grants.push([out.granted.intimacy, out.granted.trust]);
      block = out.block;
      relation = out.relation;
    }
    expect(grants.map((g) => g[1])).toEqual([1, 1, 1, 0]); // trust 第 4 次被截
    expect(relation.trust).toBe(33);
    expect(relation.intimacy).toBe(26); // 4×2=8 请求量，日上限 +6 截断
    expect(block.dailyGain).toMatchObject({ dayKey: '2026-10-15', trust: 3, intimacy: 6 });
  });

  it('跨天 rollover：次日增量重新放行', () => {
    const block = defaultRelationshipBlock();
    const r1 = applyRelationshipEvent(block, R(50, 50), R(6, 3), '2026-10-15');
    expect(r1.granted).toEqual({ intimacy: 6, trust: 3 });
    const capped = applyRelationshipEvent(r1.block, R(56, 53), R(2, 1), '2026-10-15');
    expect(capped.granted).toEqual({ intimacy: 0, trust: 0 });
    const nextDay = applyRelationshipEvent(r1.block, R(56, 53), R(2, 1), '2026-10-16');
    expect(nextDay.granted).toEqual({ intimacy: 2, trust: 1 });
    expect(nextDay.block.dailyGain.dayKey).toBe('2026-10-16');
  });

  it('负向事件不受日上限限制，且不刷新 lastPositiveDay', () => {
    const block = defaultRelationshipBlock();
    const out = applyRelationshipEvent(block, R(50, 50), R(-100, -100), '2026-10-15');
    expect(out.relation).toEqual({ intimacy: 0, trust: 0 });
    expect(out.block.lastPositiveDay).toBeNull();
  });

  it('升级实时发生并抬地板/最高纪录（挚友双门槛：先搭档，次日 trust 补到位再升挚友）', () => {
    const block = defaultRelationshipBlock();
    // 第一天：84/55 +(6,3) → 90/58。score=77.2 已过 75 但 trust 58<60 → 只到搭档
    const out = applyRelationshipEvent(block, R(84, 55), R(8, 8), '2026-10-15');
    expect(out.relation).toEqual({ intimacy: 90, trust: 58 });
    expect(displayLevelOf(out.block, out.relation)).toBe(2);
    // 第二天：trust +3 → 61，双门槛齐 → 挚友
    const out2 = applyRelationshipEvent(out.block, out.relation, R(0, 3), '2026-10-16');
    expect(out2.relation.trust).toBe(61);
    expect(displayLevelOf(out2.block, out2.relation)).toBe(3);
    expect(out2.block.highestLevelEver).toBe(3);
  });

  it('地板降级：30 天零正向不触发，满 30 天才降且每次最多 1 档，下限为认识', () => {
    // 构造已到挚友的块
    const block = {
      ...defaultRelationshipBlock(),
      levelFloor: 3,
      highestLevelEver: 3,
      lastPositiveDay: '2026-10-15',
    };
    expect(evaluateFloorAtCheckpoint(block, '2026-11-13').event).toBeNull(); // 29 天
    const d30 = evaluateFloorAtCheckpoint(block, '2026-11-14'); // 30 天
    expect(d30.event).toMatchObject({ type: 'level_down', from: 3, to: 2 });
    expect(d30.block.levelFloor).toBe(2);
    // 同一天再评估：间隔不足 30 天不连降
    expect(evaluateFloorAtCheckpoint(d30.block, '2026-11-14').event).toBeNull();
    // 再过 30 天降一档
    const d60 = evaluateFloorAtCheckpoint(d30.block, '2026-12-14');
    expect(d60.event).toMatchObject({ from: 2, to: 1 });
    // 再 30 天：地板下限 1，不再降
    const d90 = evaluateFloorAtCheckpoint(d60.block, '2027-01-13');
    expect(d90.event).toBeNull();
    expect(d90.block.levelFloor).toBe(1);
    expect(d90.block.highestLevelEver).toBe(3); // 最高纪录保留
  });

  it('地板 max 语义：分数跌穿但有正向互动时不评估降级；展示仍取地板', () => {
    const block = {
      ...defaultRelationshipBlock(),
      levelFloor: 2,
      highestLevelEver: 2,
      lastPositiveDay: '2026-10-15',
    };
    // 检查点当天有正向（lastPositiveDay=today）→ 不触发
    expect(evaluateFloorAtCheckpoint(block, '2026-10-15').event).toBeNull();
    // 分数掉到 0，展示仍是搭档
    expect(displayLevelOf(block, R(0, 0))).toBe(2);
  });

  it('迟滞 +5：降档后需超阈值 5 分才再升回；升回后迟滞解除', () => {
    const block = {
      ...defaultRelationshipBlock(),
      levelFloor: 1,
      lastFloorDownAt: '2026-11-14',
    };
    // 搭档阈值 50，迟滞下需 55
    expect(displayLevelOf(block, R(0, 0))).toBe(1);
    const almost = applyRelationshipEvent(block, R(85, 20), R(0, 0), '2026-12-01');
    expect(levelScoreOf(almost.relation)).toBe(59); // 85×0.6+20×0.4=59
    expect(almost.block.lastFloorDownAt).toBeNull(); // 59≥55 升回，解除迟滞
    expect(displayLevelOf(almost.block, almost.relation)).toBe(2);
    // 54 分不够（<55），不解除
    const notQuite = applyRelationshipEvent(
      { ...block },
      R(80, 15),
      R(0, 0),
      '2026-12-01',
    );
    expect(levelScoreOf(notQuite.relation)).toBe(54);
    expect(notQuite.block.lastFloorDownAt).toBe('2026-11-14');
  });

  it('解锁闸门', () => {
    const floor1 = { ...defaultRelationshipBlock(), levelFloor: 1 };
    expect(isRelationshipUnlocked(floor1, R(20, 30), 2)).toBe(false);
    expect(isRelationshipUnlocked(floor1, R(20, 30), 1)).toBe(true);
  });

  it('normalize：坏数据回落默认块，合法值保留', () => {
    expect(normalizeRelationshipBlock(null)).toEqual(defaultRelationshipBlock());
    expect(normalizeRelationshipBlock('x')).toEqual(defaultRelationshipBlock());
    const normalized = normalizeRelationshipBlock({
      levelFloor: 9, // 越界
      highestLevelEver: 2,
      lastPositiveDay: 'not-a-date',
      lastFloorDownAt: '2026-11-14',
      dailyGain: { dayKey: '2026-11-14', intimacy: -5, trust: 2 },
    });
    expect(normalized.levelFloor).toBe(0);
    expect(normalized.highestLevelEver).toBe(2);
    expect(normalized.lastPositiveDay).toBeNull();
    expect(normalized.dailyGain.intimacy).toBe(0);
    expect(normalized.dailyGain.trust).toBe(2);
  });
});
