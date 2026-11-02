/** v2.18 M2：图表网格定位（结构图共用） */
export type View = { width: number; height: number };
export type Point = { x: number; y: number };

export function positionsOf(
  ids: string[],
  view: View,
  options: { cols?: number; top?: number; bottom?: number; cellHeight?: number } = {},
): Map<string, Point> {
  const cols = Math.max(1, Math.min(options.cols ?? 3, ids.length));
  const top = options.top ?? 110;
  const cellHeight = options.cellHeight ?? 110;
  const usableWidth = view.width - 120;
  const cellWidth = usableWidth / cols;
  const map = new Map<string, Point>();
  ids.forEach((id, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    map.set(id, {
      x: 60 + cellWidth * col + cellWidth / 2,
      y: top + cellHeight * row,
    });
  });
  return map;
}
