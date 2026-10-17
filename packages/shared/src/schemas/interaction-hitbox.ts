/**
 * 桌宠交互热区配置 — 配置驱动 + 默认 fallback。
 *
 * 借鉴 VPet-main 的 LPS 文件 touchhead/touchbody 配置方式：每个模型可内嵌 JSON，
 * 没配的用归一化百分比默认值（0..1），PetStage 或 hitTest 函数统一读。
 *
 * 纯类型文件 + 默认值，无运行时依赖（shared 包内）。
 */

/** 归一化 0..1 的矩形 */
export interface HitRect {
  x: number; // left ratio (0..1)
  y: number; // top ratio (0..1)
  w: number; // width ratio (0..1)
  h: number; // height ratio (0..1)
}

/** 模型可配置的交互热区 */
export interface AvatarHitbox {
  /** 头部点击区（必填） */
  head: HitRect;
  /** 身体点击区（可选，没配就用 head 下面到脚） */
  body?: HitRect;
  /** 提起拖拽锚点（可选，默认模型顶部中心） */
  raised?: HitRect;
}

/**
 * 默认 fallback 热区 — 归一化百分比。
 * PetStage 现在的硬编码 top:11% height:27% 就来自这里。
 * 模型没配 AvatarHitbox 时用这些。
 */
export const DEFAULT_HITBOX: AvatarHitbox = {
  // 头部：左右各留 15%，上 11% 起，高 27%（对应 PetStage 现有硬编码）
  head: { x: 0.15, y: 0.11, w: 0.7, h: 0.27 },
  // 身体：头部下方 2% 间隙起，到脚底
  body: { x: 0.08, y: 0.40, w: 0.84, h: 0.58 },
  // 提起：默认模型顶部中心（可按需覆盖）
  raised: { x: 0.4, y: 0.02, w: 0.2, h: 0.12 },
};

/**
 * 给一个坐标点（归一化 0..1 相对窗口）+ 热区，命中哪个区域。
 * 同时支持模型自定义 hitbox 和默认 fallback 合并。
 */
export function hitTestRegion(
  nx: number,
  ny: number,
  hitbox?: AvatarHitbox,
): 'head' | 'body' | 'raised' | 'unknown' {
  const hb = hitbox ?? DEFAULT_HITBOX;
  // 优先级：head > raised > body（raised 是提起小区域，身体大面积在 head 下层）
  if (inRect(nx, ny, hb.head)) return 'head';
  if (hb.raised && inRect(nx, ny, hb.raised)) return 'raised';
  if (hb.body && inRect(nx, ny, hb.body)) return 'body';
  return 'unknown';
}

function inRect(nx: number, ny: number, r: HitRect): boolean {
  return nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h;
}

/** 合并模型自定义配置和默认值——自定义优先 */
export function mergeHitbox(custom?: Partial<AvatarHitbox>): AvatarHitbox {
  if (!custom) return DEFAULT_HITBOX;
  return {
    head: custom.head ?? DEFAULT_HITBOX.head,
    body: custom.body ?? DEFAULT_HITBOX.body,
    raised: custom.raised ?? DEFAULT_HITBOX.raised,
  };
}
