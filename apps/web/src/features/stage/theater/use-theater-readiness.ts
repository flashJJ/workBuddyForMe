'use client';

import * as React from 'react';
import { isVrmAvatarId, type StageCastMember, type StageSlot } from '@wbfm/shared/schemas';

export interface TheaterReadiness {
  /** 幕布可以打开：所有 VRM 角色已就绪、失败或等待超时 */
  ready: boolean;
  readyCount: number;
  total: number;
  /** 模型加载完成/失败都调用：失败也放行，避免整场卡在幕布后 */
  markReady: (slot: StageSlot) => void;
}

/** 首屏三席 25MB 级模型在慢盘上可能需要 20–30s，留足超时兜底 */
const READY_TIMEOUT_MS = 45_000;

/**
 * 剧场就绪度：只统计 VRM 席位（Live2D 由共享层自行加载）。
 * 全部就绪或超时后返回 ready=true，加载幕布才会打开。
 */
export function useTheaterReadiness(
  cast: StageCastMember[],
  enabled: boolean,
): TheaterReadiness {
  const slots = React.useMemo(
    () => cast.filter((member) => isVrmAvatarId(member.avatarModelId)).map((member) => member.slot),
    [cast],
  );
  const key = slots.join('|');
  const [done, setDone] = React.useState<Partial<Record<StageSlot, boolean>>>({});
  const readyCount = slots.filter((slot) => done[slot]).length;
  const total = slots.length;
  const allReady = total === 0 || readyCount >= total;

  // cast 变化时重置，避免沿用上一集的就绪状态
  React.useEffect(() => {
    setDone({});
  }, [key]);

  // 兜底：个别模型失败或网络卡住时不无限等待
  React.useEffect(() => {
    if (!enabled || allReady) return;
    const timer = window.setTimeout(() => {
      setDone(Object.fromEntries(slots.map((slot) => [slot, true])) as Partial<Record<StageSlot, boolean>>);
    }, READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, allReady, slots]);

  const markReady = React.useCallback((slot: StageSlot) => {
    setDone((prev) => (prev[slot] ? prev : { ...prev, [slot]: true }));
  }, []);

  return { ready: !enabled || allReady, readyCount, total, markReady };
}
