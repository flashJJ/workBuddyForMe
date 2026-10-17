import {
  DEFAULT_MOTION_MOOD,
  MOTION_SEGMENT_PRIORITY,
  type MotionMood,
  type MotionSegment,
} from '@wbfm/shared/schemas';
import type * as THREE from 'three';

/**
 * v2.2 M1：动作条目的段聚合与段位解析（纯函数，可单测）。
 *
 * 数据侧（v033）给每条 clip 标了 `segment` / `entryKey`——同 `entryKey` 的多条 clip
 * 聚合成一个「动作条目」，条目内含 a_start / b_loop / c_end / single 四种段。
 * 播放层（MotionMixer）据此把「播一段 clip」升级为「调度一个条目的三段」。
 *
 * 缺段退化口径（契约 docs/plan/v2.2/02）：
 * - 入场缺 A → 直接进循环段；
 * - 退场缺 C → 直接回待机；
 * - 只有 single → 它自己既是入场也是循环段。
 */

/** 动作池单条 clip + v2.2 元数据（loader 组装后交给 MotionMixer） */
export interface MotionPoolEntry {
  clip: THREE.AnimationClip;
  /** 展示名（用户命名 / 内置名） */
  name: string;
  segment: MotionSegment;
  /** 条目键；空表示该 clip 自成条目 */
  entryKey: string | null;
  mood: MotionMood;
  minRelationshipLevel: number | null;
}

/** 聚合后的动作条目 */
export interface MotionEntry {
  /** 条目键（null = 单段自成条目） */
  key: string | null;
  /** 段 → clip 映射（缺段即缺键） */
  clips: Partial<Record<MotionSegment, THREE.AnimationClip>>;
  /** 情绪档位（按段优先级取第一条有值的行，同键各行应写相同值） */
  mood: MotionMood;
  /** 关系门槛（同上） */
  minRelationshipLevel: number | null;
  /** 循环段 clip（待机轮播 / 点击手势用；同键至少有一条 clip 时必存在） */
  loopClip: THREE.AnimationClip;
}

/** 段属性取值优先级：与契约 MOTION_SEGMENT_PRIORITY 一致（循环段优先） */
const PRIORITY: readonly MotionSegment[] = MOTION_SEGMENT_PRIORITY;

/** 同键多段聚合成条目；`single` 本身即循环段，故 loopClip 必有值。 */
function buildEntry(key: string | null, rows: MotionPoolEntry[]): MotionEntry {
  const clips: Partial<Record<MotionSegment, THREE.AnimationClip>> = {};
  for (const row of rows) {
    // 同段重复：取先到者（导入侧不应产生同段重复）
    if (!clips[row.segment]) clips[row.segment] = row.clip;
  }
  let primary: MotionPoolEntry | undefined;
  for (const segment of PRIORITY) {
    primary = rows.find((row) => row.segment === segment);
    if (primary) break;
  }
  const loopClip = clips.b_loop ?? clips.single ?? clips.a_start ?? clips.c_end;
  if (!loopClip) throw new Error('动作条目至少需要一条 clip');
  return {
    key,
    clips,
    mood: primary?.mood ?? DEFAULT_MOTION_MOOD,
    minRelationshipLevel: primary?.minRelationshipLevel ?? null,
    loopClip,
  };
}

/** 把动作池条目按 entryKey 聚合成动作条目；空键的自成条目（保持入池顺序）。 */
export function groupMotionEntries(entries: MotionPoolEntry[]): MotionEntry[] {
  const grouped = new Map<string, MotionPoolEntry[]>();
  const singles: MotionPoolEntry[] = [];
  for (const entry of entries) {
    if (!entry.entryKey) {
      singles.push(entry);
      continue;
    }
    const rows = grouped.get(entry.entryKey);
    if (rows) rows.push(entry);
    else grouped.set(entry.entryKey, [entry]);
  }
  const result = singles.map((row) => buildEntry(null, [row]));
  for (const [key, rows] of grouped) result.push(buildEntry(key, rows));
  return result;
}

/** 入场段：缺 A 退化到循环段（single / b_loop …）。 */
export function entryStartClip(entry: MotionEntry): THREE.AnimationClip {
  return entry.clips.a_start ?? entry.loopClip;
}

/** 循环段：`single` 也是循环段。 */
export function entryLoopClip(entry: MotionEntry): THREE.AnimationClip {
  return entry.loopClip;
}

/** 退场段：缺 C 返回 null（调用方直接回待机）。 */
export function entryEndClip(entry: MotionEntry): THREE.AnimationClip | null {
  return entry.clips.c_end ?? null;
}

/** 条目是否显式标了 A/B/C 段（长按挑选时优先选有三段示范的条目）。 */
export function isSegmentedEntry(entry: MotionEntry): boolean {
  return Boolean(entry.clips.a_start || entry.clips.b_loop || entry.clips.c_end);
}

/** 从候选里挑一个长按条目：优先多段示范，退化到全池；rng 可注入测试。 */
export function pickHoldEntry(
  entries: MotionEntry[],
  rng: () => number = Math.random,
): MotionEntry | null {
  if (entries.length === 0) return null;
  const segmented = entries.filter(isSegmentedEntry);
  const pool = segmented.length > 0 ? segmented : entries;
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index] ?? pool[0] ?? null;
}
