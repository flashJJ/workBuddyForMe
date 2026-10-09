import { desktopCapturer, screen } from 'electron';
import type { ScreenSnapshotArgs, ScreenSnapshotResponse } from '@wbfm/shared/schemas';
import { planSnapshot } from './screen-plan';

/**
 * 捕获光标所在显示器的屏幕截图：
 * 以物理像素尺寸取 thumbnail，按 planSnapshot 计划先裁剪后缩放，
 * 返回的 scaleFactor 用于把成品图坐标换算回源显示器物理像素
 * （物理坐标 = originX + 图坐标 / scaleFactor）。
 */
export async function captureScreenSnapshot(args: ScreenSnapshotArgs): Promise<ScreenSnapshotResponse> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const physicalWidth = Math.round(display.size.width * display.scaleFactor);
  const physicalHeight = Math.round(display.size.height * display.scaleFactor);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: physicalWidth, height: physicalHeight },
  });
  const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('未找到可用屏幕源');
  }

  const region = args.scope === 'region' ? args.region : undefined;
  const plan = planSnapshot(physicalWidth, physicalHeight, region);

  let image = source.thumbnail;
  if (plan.crop) image = image.crop(plan.crop);
  if (plan.resize) {
    image = image.resize({ width: plan.resize.width, height: plan.resize.height, quality: 'good' });
  }
  const size = image.getSize();

  return {
    imageBase64: image.toPNG().toString('base64'),
    mimeType: 'image/png',
    width: size.width,
    height: size.height,
    sourceWidth: plan.crop?.width ?? physicalWidth,
    sourceHeight: plan.crop?.height ?? physicalHeight,
    originX: plan.crop?.x ?? 0,
    originY: plan.crop?.y ?? 0,
    scaleFactor: plan.scaleFactor,
  };
}
