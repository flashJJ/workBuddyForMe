import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { MotionMood, MotionSegment } from '@wbfm/shared/schemas';
import {
  entryEndClip,
  entryLoopClip,
  entryStartClip,
  groupMotionEntries,
  isSegmentedEntry,
  pickHoldEntry,
  type MotionEntry,
  type MotionPoolEntry,
} from './motion-segments';

const clip = (name: string) => new THREE.AnimationClip(name, 1, []);

function poolEntry(
  segment: MotionSegment,
  entryKey: string | null,
  extra: { name?: string; mood?: MotionMood } = {},
): MotionPoolEntry {
  const name = extra.name ?? `${entryKey ?? 'solo'}-${segment}`;
  return {
    clip: clip(name),
    name,
    segment,
    entryKey,
    mood: extra.mood ?? 'normal',
    minRelationshipLevel: null,
  };
}

const first = (entries: MotionPoolEntry[]): MotionEntry => {
  const entry = groupMotionEntries(entries)[0];
  if (!entry) throw new Error('期望至少一个条目');
  return entry;
};

describe('groupMotionEntries', () => {
  it('同 entryKey 的多段 clip 聚合成一个条目，loopClip 取 b_loop', () => {
    const entries = groupMotionEntries([
      poolEntry('a_start', 'wave'),
      poolEntry('b_loop', 'wave'),
      poolEntry('c_end', 'wave'),
    ]);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.key).toBe('wave');
    expect(entry.clips.a_start?.name).toBe('wave-a_start');
    expect(entry.clips.b_loop?.name).toBe('wave-b_loop');
    expect(entry.clips.c_end?.name).toBe('wave-c_end');
    expect(entryLoopClip(entry).name).toBe('wave-b_loop');
  });

  it('空 entryKey 的 clip 各自成条目', () => {
    const entries = groupMotionEntries([poolEntry('single', null), poolEntry('single', null)]);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.key === null)).toBe(true);
  });

  it('只有 single 时它自己既是入场也是循环段', () => {
    const entry = first([poolEntry('single', null)]);
    expect(entryLoopClip(entry).name).toBe('solo-single');
    expect(entryStartClip(entry).name).toBe('solo-single');
    expect(entryEndClip(entry)).toBeNull();
    expect(isSegmentedEntry(entry)).toBe(false);
  });

  it('条目档位/门槛按段优先级（b_loop → single → a_start → c_end）取第一条', () => {
    const entry = first([
      poolEntry('a_start', 'wave', { mood: 'low' }),
      poolEntry('b_loop', 'wave', { mood: 'good' }),
    ]);
    expect(entry.mood).toBe('good');
  });

  it('缺 A 时 entryStartClip 退化到循环段；缺 C 时 entryEndClip 返回 null', () => {
    const entry = first([poolEntry('b_loop', 'wave')]);
    expect(entryStartClip(entry).name).toBe('wave-b_loop');
    expect(entryEndClip(entry)).toBeNull();
    expect(isSegmentedEntry(entry)).toBe(true);
  });
});

describe('pickHoldEntry', () => {
  it('优先挑显式标了 A/B/C 段的条目', () => {
    const segmented = first([poolEntry('b_loop', 'wave')]);
    const solo = first([poolEntry('single', null)]);
    const picked = pickHoldEntry([solo, segmented], () => 0);
    expect(picked).toBe(segmented);
  });

  it('没有多段条目时退化到全池；空池返回 null', () => {
    const solo = first([poolEntry('single', null)]);
    expect(pickHoldEntry([solo], () => 0)).toBe(solo);
    expect(pickHoldEntry([])).toBeNull();
  });
});
