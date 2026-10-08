import { SCREENSHOT_MAX_EDGE, type ScreenSnapshotRegion } from '@wbfm/shared/schemas';

/** 截图计划：先裁剪（物理像素）后等比缩放到 maxEdge 内 */
export interface SnapshotPlan {
  /** 源显示器物理像素下的裁剪矩形（undefined = 整屏） */
  crop?: ScreenSnapshotRegion;
  /** 裁剪后再缩放的目标尺寸（undefined = 无需缩放） */
  resize?: { width: number; height: number };
  /** 等比缩放比（成品边长 / 源区域边长），坐标换算回真实屏幕时除以它 */
  scaleFactor: number;
}

/**
 * 纯函数：根据源显示器物理尺寸与可选区域计算裁剪/缩放计划。
 * region 语义：相对显示器原点的物理像素坐标；越界部分会被夹紧，完全越界抛错。
 */
export function planSnapshot(
  sourceWidth: number,
  sourceHeight: number,
  region?: ScreenSnapshotRegion,
  maxEdge: number = SCREENSHOT_MAX_EDGE,
): SnapshotPlan {
  const crop = region ? clampRegion(region, sourceWidth, sourceHeight) : undefined;
  const width = crop?.width ?? sourceWidth;
  const height = crop?.height ?? sourceHeight;
  const scaleFactor = Math.min(1, maxEdge / Math.max(width, height));
  const resize =
    scaleFactor < 1
      ? {
          width: Math.max(1, Math.round(width * scaleFactor)),
          height: Math.max(1, Math.round(height * scaleFactor)),
        }
      : undefined;
  return { crop, resize, scaleFactor };
}

function clampRegion(region: ScreenSnapshotRegion, sourceWidth: number, sourceHeight: number): ScreenSnapshotRegion {
  const x = Math.min(Math.max(0, region.x), sourceWidth);
  const y = Math.min(Math.max(0, region.y), sourceHeight);
  const width = Math.min(region.width, sourceWidth - x);
  const height = Math.min(region.height, sourceHeight - y);
  if (width <= 0 || height <= 0) {
    throw new Error(`截图区域超出屏幕范围（源尺寸 ${sourceWidth}x${sourceHeight}）`);
  }
  return { x, y, width, height };
}
