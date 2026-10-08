import type { ScreenSnapshotResponse, UiaElement } from '@wbfm/shared/schemas';

/**
 * v0.7 M3-3 SoM（Set-of-Mark）编号标记视觉兜底。
 * 自绘 UI/Electron 窗口拿不到 UIA 控件时，在截图上叠加编号框（1,2,3...）+ 坐标表，
 * 模型「选编号」而非「输出像素坐标」，把回归问题变分类问题。
 * 优先用 UIA 控件（确定性）；UIA 缺失或无 interactable 控件时按等距网格兜底。
 */

/** 网格兜底单元格大小（成品图像素，控编号可读 + 编号密度） */
export const SOM_GRID_CELL_SIZE = 180;
/** 标记条目上限（控视觉 token + 编号可读） */
export const SOM_MAX_ENTRIES = 40;
/** 标签字号（成品图像素） */
const SOM_LABEL_FONT_SIZE = 18;
/** 标签底色 padding（成品图像素） */
const SOM_LABEL_PADDING = 3;
/** 编号标签底色 */
const SOM_LABEL_BG = 'rgba(220, 38, 38, 0.92)';
/** 编号标签前景色 */
const SOM_LABEL_FG = '#ffffff';
/** 矩形描边色（UIA 命中用蓝，网格兜底用红） */
const SOM_STROKE_UIA = 'rgba(37, 99, 235, 0.9)';
const SOM_STROKE_GRID = 'rgba(220, 38, 38, 0.65)';

export interface SomMeta {
  /** 成品图尺寸（≤ SCREENSHOT_MAX_EDGE） */
  width: number;
  height: number;
  /** 截图源区域物理像素尺寸与原点（坐标换算回真实屏幕） */
  sourceWidth: number;
  sourceHeight: number;
  originX: number;
  originY: number;
  /** 缩放比 = 成品图边长 / 源区域边长 */
  scaleFactor: number;
}

export interface SomEntry {
  /** 编号（1-based，模型选择输出此编号） */
  number: number;
  /** 标签：UIA 控件名+类型；网格兜底为空字符串 */
  label: string;
  /** 真实屏幕物理像素矩形（与 mouse_click 坐标系一致） */
  rect: { x: number; y: number; width: number; height: number };
  /** 真实屏幕物理像素中心点（点击坐标） */
  center: { x: number; y: number };
  /** 来源：uia=UIA 控件；grid=网格兜底 */
  source: 'uia' | 'grid';
}

export interface SomInput {
  /** UIA 控件清单（缺省/空数组均触发网格兜底） */
  uiaElements?: readonly UiaElement[];
  /** 截图元数据（成品图尺寸 + 源区域 + 缩放比） */
  meta: SomMeta;
}

export interface SomOutput {
  entries: SomEntry[];
  /** 注入决策上下文的坐标表文本（已截断） */
  entriesText: string;
  /** 是否走了网格兜底（前端 / 日志可读） */
  fallbackToGrid: boolean;
}

function area(r: { width: number; height: number }): number {
  return r.width * r.height;
}

function centerOf(r: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return { x: r.x + Math.round(r.width / 2), y: r.y + Math.round(r.height / 2) };
}

/** 把成品图坐标转换为真实屏幕物理像素坐标（坐标还原用） */
export function imageToSource(point: { x: number; y: number }, meta: SomMeta): { x: number; y: number } {
  return {
    x: Math.round(meta.originX + point.x / meta.scaleFactor),
    y: Math.round(meta.originY + point.y / meta.scaleFactor),
  };
}

/** 把真实屏幕物理像素坐标转换为成品图坐标（绘图用） */
export function sourceToImage(rect: { x: number; y: number; width: number; height: number }, meta: SomMeta): { x: number; y: number; width: number; height: number } {
  const x = (rect.x - meta.originX) * meta.scaleFactor;
  const y = (rect.y - meta.originY) * meta.scaleFactor;
  return {
    x,
    y,
    width: rect.width * meta.scaleFactor,
    height: rect.height * meta.scaleFactor,
  };
}

/**
 * 构建 SoM 标记条目：
 * - UIA 有 interactable 控件：按面积倒序，截断到 SOM_MAX_ENTRIES，编号 1..N
 * - UIA 缺失或无 interactable：按 SOM_GRID_CELL_SIZE 等距网格兜底
 * 所有 rect/center 一律为真实屏幕物理像素（与 mouse_click 坐标系一致）。
 */
export function buildSomEntries(input: SomInput): SomOutput {
  const interactable = (input.uiaElements ?? []).filter((e) => e.interactable && area(e.rect) > 0);
  if (interactable.length > 0) {
    const sorted = [...interactable].sort((a, b) => area(b.rect) - area(a.rect));
    const entries = sorted.slice(0, SOM_MAX_ENTRIES).map((e, i) => ({
      number: i + 1,
      label: [e.name, e.controlType].filter(Boolean).filter((s) => s.length > 0).join(' ') || '控件',
      rect: e.rect,
      center: centerOf(e.rect),
      source: 'uia' as const,
    }));
    return { entries, entriesText: formatEntriesText(entries), fallbackToGrid: false };
  }
  const entries = buildGridEntries(input.meta);
  return { entries, entriesText: formatEntriesText(entries), fallbackToGrid: true };
}

function buildGridEntries(meta: SomMeta): SomEntry[] {
  const { sourceWidth: sw, sourceHeight: sh, originX, originY } = meta;
  if (sw <= 0 || sh <= 0) return [];
  const cols = Math.max(1, Math.ceil(sw / SOM_GRID_CELL_SIZE));
  const rows = Math.max(1, Math.ceil(sh / SOM_GRID_CELL_SIZE));
  const cellW = Math.ceil(sw / cols);
  const cellH = Math.ceil(sh / rows);
  const entries: SomEntry[] = [];
  let n = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (n >= SOM_MAX_ENTRIES) return entries;
      n += 1;
      const x = originX + col * cellW;
      const y = originY + row * cellH;
      const w = Math.min(cellW, sw - col * cellW);
      const h = Math.min(cellH, sh - row * cellH);
      const rect = { x, y, width: w, height: h };
      entries.push({ number: n, label: '', rect, center: centerOf(rect), source: 'grid' });
    }
  }
  return entries;
}

/** 编号→坐标表文本（注入决策上下文） */
export function formatEntriesText(entries: readonly SomEntry[]): string {
  if (entries.length === 0) return '（无可标记区域）';
  const lines = entries.map((e) =>
    `#${e.number}${e.label ? ` [${e.label}]` : ''} 中心(${e.center.x},${e.center.y}) ${e.rect.width}x${e.rect.height}`,
  );
  return `编号→坐标表（共 ${entries.length} 项，模型输出 #编号 选定目标）：\n${lines.join('\n')}`;
}

type NapiCanvasModule = typeof import('@napi-rs/canvas');
let canvasModulePromise: Promise<NapiCanvasModule> | null = null;
function loadCanvas(): Promise<NapiCanvasModule> {
  if (!canvasModulePromise) canvasModulePromise = import('@napi-rs/canvas') as Promise<NapiCanvasModule>;
  return canvasModulePromise;
}

export interface MarkScreenshotInput {
  /** 截图响应（成品图） */
  snapshot: Pick<ScreenSnapshotResponse, 'imageBase64' | 'mimeType' | 'width' | 'height' | 'sourceWidth' | 'sourceHeight' | 'originX' | 'originY' | 'scaleFactor'>;
  /** UIA 控件清单（可能为空） */
  uiaElements?: readonly UiaElement[];
  /** 测试注入：canvas 模块 */
  canvasModule?: NapiCanvasModule;
}

export interface MarkScreenshotOutput {
  /** 标记后图片 base64（同一 mimeType） */
  imageBase64: string;
  mimeType: 'image/png';
  entries: SomEntry[];
  entriesText: string;
  fallbackToGrid: boolean;
}

/**
 * 在截图上叠加 SoM 编号标记：成品图 → 解码 → 在每个 entry 矩形处描边 + 编号标签 → PNG 编码。
 * 失败（canvas 不可用/解码失败）时回退原图（不阻塞任务流，仅日志）。
 */
export async function markScreenshot(input: MarkScreenshotInput): Promise<MarkScreenshotOutput> {
  const meta: SomMeta = {
    width: input.snapshot.width,
    height: input.snapshot.height,
    sourceWidth: input.snapshot.sourceWidth,
    sourceHeight: input.snapshot.sourceHeight,
    originX: input.snapshot.originX,
    originY: input.snapshot.originY,
    scaleFactor: input.snapshot.scaleFactor,
  };
  const { entries, entriesText, fallbackToGrid } = buildSomEntries({ uiaElements: input.uiaElements, meta });

  if (entries.length === 0) {
    return { imageBase64: input.snapshot.imageBase64, mimeType: 'image/png', entries, entriesText: formatEntriesText([]), fallbackToGrid };
  }

  try {
    const canvasLib = input.canvasModule ?? (await loadCanvas());
    const img = new canvasLib.Image();
    img.src = Buffer.from(input.snapshot.imageBase64, 'base64');
    const canvas = canvasLib.createCanvas(meta.width, meta.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.lineWidth = 2;
    ctx.font = `${SOM_LABEL_FONT_SIZE}px sans-serif`;
    ctx.textBaseline = 'top';
    for (const entry of entries) {
      const r = sourceToImage(entry.rect, meta);
      const stroke = entry.source === 'uia' ? SOM_STROKE_UIA : SOM_STROKE_GRID;
      ctx.strokeStyle = stroke;
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      const label = `${entry.number}`;
      const tw = ctx.measureText(label).width;
      const bgX = r.x + SOM_LABEL_PADDING;
      const bgY = r.y + SOM_LABEL_PADDING;
      ctx.fillStyle = SOM_LABEL_BG;
      ctx.fillRect(bgX, bgY, tw + SOM_LABEL_PADDING * 2, SOM_LABEL_FONT_SIZE + SOM_LABEL_PADDING * 2);
      ctx.fillStyle = SOM_LABEL_FG;
      ctx.fillText(label, bgX + SOM_LABEL_PADDING, bgY + SOM_LABEL_PADDING);
    }
    const buffer = canvas.toBuffer('image/png');
    return { imageBase64: buffer.toString('base64'), mimeType: 'image/png', entries, entriesText, fallbackToGrid };
  } catch (error) {
    console.error('[som] 标记叠加失败，回退原图:', error);
    return { imageBase64: input.snapshot.imageBase64, mimeType: 'image/png', entries, entriesText, fallbackToGrid };
  }
}
