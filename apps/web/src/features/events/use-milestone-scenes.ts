'use client';

import * as React from 'react';
import { RELATIONSHIP_MILESTONES } from '@wbfm/shared/constants';
import { useRelationshipMilestones } from '@/lib/hooks/use-relationship-milestones';

const STORAGE_PREFIX = 'wbfm:milestones-seen:';

function readSeen(assistantId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + assistantId);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeSeen(assistantId: string, seen: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + assistantId, JSON.stringify([...seen]));
  } catch {
    // 隐私模式/存储满：本会话内仍由 ref 去重
  }
}

/** key → 纪念剧本 id 映射（与 RELATIONSHIP_MILESTONES 定义同源） */
const SCENE_BY_KEY = new Map(RELATIONSHIP_MILESTONES.map((d) => [d.key, d.sceneId]));

export interface UseMilestoneScenesArgs {
  assistantId: string;
  /** 关系等级开关（关闭时不评估、不触发） */
  relationshipEnabled: boolean;
  /** 事件总开关 + 形象/桌宠出口（无出口时导演会记 suppressed，提前拦掉） */
  eventsEnabled: boolean;
  hasOutlet: boolean;
  convLocked: boolean;
  triggerEvent: (eventId: string, extraCounters?: Record<string, number>) => boolean;
}

/**
 * v2.0 M2 共同里程碑纪念演出：
 * - 30s 轮询的里程碑达成集新增 key 时触发对应 ev.milestone.* 剧本；
 * - 已见集合持久化在 localStorage（每助手），刷新/重开不补演；
 * - 首次见到该助手（或全部已见）只立基线；降档/删除等服务端状态变化不演。
 */
export function useMilestoneScenes(args: UseMilestoneScenesArgs): void {
  const { data: milestones } = useRelationshipMilestones(
    args.relationshipEnabled ? args.assistantId : null,
    args.relationshipEnabled,
  );
  const argsRef = React.useRef(args);
  argsRef.current = args;
  const baselineRef = React.useRef<{ assistantId: string; inited: boolean } | null>(null);

  React.useEffect(() => {
    if (!milestones) return;
    const { assistantId } = argsRef.current;
    if (baselineRef.current?.assistantId !== assistantId) {
      // 切助手/首次：以当前已见（localStorage）并集当前达成集为基线，不补演历史
      const seen = readSeen(assistantId);
      for (const m of milestones) seen.add(m.milestoneKey);
      writeSeen(assistantId, seen);
      baselineRef.current = { assistantId, inited: true };
      return;
    }
    const seen = readSeen(assistantId);
    let changed = false;
    for (const m of milestones) {
      if (seen.has(m.milestoneKey)) continue;
      seen.add(m.milestoneKey);
      changed = true;
      const { eventsEnabled, hasOutlet, convLocked, triggerEvent } = argsRef.current;
      const sceneId = SCENE_BY_KEY.get(m.milestoneKey);
      if (sceneId && eventsEnabled && hasOutlet && !convLocked) {
        triggerEvent(sceneId);
      }
    }
    if (changed) writeSeen(assistantId, seen);
  }, [milestones]);
}
