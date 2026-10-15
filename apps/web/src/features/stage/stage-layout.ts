import type { StageScenePayload, StageSlot, StageSlotPlacement } from '@wbfm/shared/schemas';

/**
 * 舞台站位与聚焦的纯计算（v1.9 M1，无 DOM 依赖，可单测）。
 * 坐标系：x/y 都是相对舞台的 0..1 比例，锚点为角色包围盒中心。
 */

/**
 * 槽位默认站位：v1.9 M1 三槽（左/中/右）；
 * farRight 为 v1.9 M3 会议第 4 席，其实际坐标在会议 4 人布局里由 meetingPosition 按
 * 席次均布覆盖（此处给兜底值，保证拖拽/独立使用时不失位）。
 */
export const DEFAULT_SLOT_PLACEMENTS: Record<StageSlot, StageSlotPlacement> = {
  left: { x: 0.21, y: 0.66, scale: 0.92 },
  center: { x: 0.5, y: 0.6, scale: 1 },
  right: { x: 0.79, y: 0.66, scale: 0.92 },
  farRight: { x: 0.9, y: 0.68, scale: 0.86 },
};

/** 角色盒基础高（占舞台高比例）；宽度由 aspect 比推出 */
export const ACTOR_BASE_HEIGHT_RATIO = 0.82;
/** 角色盒宽高比（Live2D 模型近 3:4，画布内自动居中） */
export const ACTOR_ASPECT = 0.56;
/** 当前发言者放大系数 */
export const FOCUS_SCALE_BOOST = 1.12;
/** 非发言者缩小/降饱和系数 */
export const NON_FOCUS_SCALE = 1; // 槽位 scale 已在默认站位表达，这里不再二次缩小
/** 非发言者滤镜（视觉让位；不做三维光照） */
export const NON_FOCUS_FILTER = 'brightness(0.68) saturate(0.78)';
export const FOCUS_FILTER = 'none';

export const SLOT_ORDER: StageSlot[] = ['left', 'center', 'right', 'farRight'];

/**
 * v1.9 M3 会议 N 人均布站位（2–4）。坐标按席次 index 在舞台上均分，
 * 4 人稍缩小并下沉，保证不挤出场；scale 作为额外乘数传给布局。
 */
export function meetingPosition(
  index: number,
  count: number,
): { x: number; y: number; scale: number } {
  if (count <= 2) {
    return index === 0
      ? { x: 0.31, y: 0.66, scale: 0.96 }
      : { x: 0.69, y: 0.66, scale: 0.96 };
  }
  if (count >= 4) {
    const xs = [0.13, 0.38, 0.62, 0.87];
    return { x: xs[index] ?? 0.5, y: 0.68, scale: 0.86 };
  }
  return { x: [0.21, 0.5, 0.79][index] ?? 0.5, y: 0.66, scale: index === 1 ? 1 : 0.92 };
}

export function resolvePlacement(
  slot: StageSlot,
  payload: Pick<StageScenePayload, 'slots' | 'sceneZoom'>,
): StageSlotPlacement & { zoom: number } {
  const override = payload.slots[slot];
  return {
    x: override?.x ?? DEFAULT_SLOT_PLACEMENTS[slot].x,
    y: override?.y ?? DEFAULT_SLOT_PLACEMENTS[slot].y,
    scale: override?.scale ?? DEFAULT_SLOT_PLACEMENTS[slot].scale,
    zoom: payload.sceneZoom,
  };
}

export interface ActorLayout {
  /** CSS left/top（百分比，配 translate(-50%,-50%) 中心锚定） */
  leftPct: number;
  topPct: number;
  /** 角色盒高（vh 百分比） */
  heightVh: number;
  /** 角色盒宽（=高×宽高比，vh 单位） */
  widthVh: number;
  scale: number;
  focused: boolean;
  filter: string;
  zIndex: number;
}

/**
 * 计算单槽角色的最终布局。
 * @param slot 槽位
 * @param payload 场景（站位覆盖 + 画面缩放）
 * @param focusedSlot 当前聚焦槽；null=散焦（全员同权）
 * @param positionOverride v1.9 M3 会议 N 人均布坐标（提供时替代场景/默认站位）
 */
export function computeActorLayout(
  slot: StageSlot,
  payload: Pick<StageScenePayload, 'slots' | 'sceneZoom'>,
  focusedSlot: StageSlot | null,
  positionOverride?: { x: number; y: number; scale: number } | null,
): ActorLayout {
  const p = positionOverride
    ? { ...positionOverride, zoom: payload.sceneZoom }
    : resolvePlacement(slot, payload);
  const focused = focusedSlot === slot;
  // 散焦时不施加聚焦差异
  const boost = focusedSlot === null ? 1 : focused ? FOCUS_SCALE_BOOST : NON_FOCUS_SCALE;
  const scale = p.scale * p.zoom * boost;
  const heightVh = ACTOR_BASE_HEIGHT_RATIO * 100 * scale;
  return {
    leftPct: p.x * 100,
    topPct: p.y * 100,
    heightVh,
    widthVh: heightVh * ACTOR_ASPECT,
    scale,
    focused,
    filter: focusedSlot === null || focused ? FOCUS_FILTER : NON_FOCUS_FILTER,
    // 中槽在上，聚焦者提到最前；同层时中>左>右保证稳定顺序
    zIndex: focused ? 30 : slot === 'center' ? 20 : 10,
  };
}

/** 滚轮缩放夹紧（单角色） */
export function clampActorScale(scale: number): number {
  return Math.min(1.6, Math.max(0.6, Number(scale.toFixed(3))));
}

/** Ctrl+滚轮画面缩放夹紧 */
export function clampSceneZoom(zoom: number): number {
  return Math.min(1.3, Math.max(0.7, Number(zoom.toFixed(3))));
}

/** 拖拽位置夹紧（允许少量出血但不丢角色） */
export function clampRatio(value: number): number {
  return Math.min(0.95, Math.max(0.05, Number(value.toFixed(4))));
}
