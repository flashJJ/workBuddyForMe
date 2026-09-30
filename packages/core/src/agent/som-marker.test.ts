import { describe, expect, it } from 'vitest';
import {
  buildSomEntries,
  formatEntriesText,
  imageToSource,
  sourceToImage,
  SOM_GRID_CELL_SIZE,
  SOM_MAX_ENTRIES,
  type SomMeta,
} from './som-marker';

const META: SomMeta = {
  width: 1000,
  height: 600,
  sourceWidth: 2000,
  sourceHeight: 1200,
  originX: 100,
  originY: 50,
  scaleFactor: 0.5,
};

function rect(x: number, y: number, w: number, h: number) {
  return { x, y, width: w, height: h };
}
function uiaEl(name: string, type: string, r: { x: number; y: number; width: number; height: number }, interactable = true) {
  return { name, controlType: type, automationId: '', rect: r, interactable };
}

describe('buildSomEntries（v0.7 M3-3 SoM 标记）', () => {
  describe('UIA 路径', () => {
    it('过滤禁用控件，按面积倒序编号', () => {
      const out = buildSomEntries({
        meta: META,
        uiaElements: [
          uiaEl('保存', 'Button', rect(100, 50, 80, 30), true),
          uiaEl('编辑区', 'Edit', rect(100, 100, 1000, 800), true),
          uiaEl('禁用项', 'Button', rect(100, 50, 200, 100), false),
        ],
      });
      expect(out.fallbackToGrid).toBe(false);
      expect(out.entries).toHaveLength(2);
      // 面积倒序：编辑区 800000 > 保存 2400
      expect(out.entries[0]?.label).toBe('编辑区 Edit');
      expect(out.entries[0]?.number).toBe(1);
      expect(out.entries[0]?.source).toBe('uia');
      expect(out.entries[1]?.label).toBe('保存 Button');
      expect(out.entries[1]?.number).toBe(2);
      // 真实屏幕物理坐标（直接来自 UIA rect）
      expect(out.entries[0]?.center).toEqual({ x: 600, y: 500 });
    });

    it('标签空名+空类型回落为「控件」', () => {
      const out = buildSomEntries({
        meta: META,
        uiaElements: [uiaEl('', '', rect(100, 50, 100, 50), true)],
      });
      expect(out.entries[0]?.label).toBe('控件');
    });

    it('面积 0 控件被过滤', () => {
      const out = buildSomEntries({
        meta: META,
        uiaElements: [
          { name: '退化', controlType: 'Pane', automationId: '', rect: rect(100, 50, 0, 0), interactable: true },
          uiaEl('按钮', 'Button', rect(100, 50, 10, 10), true),
        ],
      });
      expect(out.entries).toHaveLength(1);
      expect(out.entries[0]?.label).toBe('按钮 Button');
    });

    it(`截断到 ${SOM_MAX_ENTRIES} 项（控视觉 token）`, () => {
      const list = Array.from({ length: SOM_MAX_ENTRIES + 5 }, (_, i) =>
        uiaEl(`btn${i}`, 'Button', rect(100 + i, 50, 10, 10), true),
      );
      const out = buildSomEntries({ meta: META, uiaElements: list });
      expect(out.entries).toHaveLength(SOM_MAX_ENTRIES);
      expect(out.entries[SOM_MAX_ENTRIES - 1]?.number).toBe(SOM_MAX_ENTRIES);
    });
  });

  describe('网格兜底', () => {
    it('UIA 缺失：等距网格兜底，编号 1..N', () => {
      const out = buildSomEntries({ meta: META });
      expect(out.fallbackToGrid).toBe(true);
      const cols = Math.ceil(META.sourceWidth / SOM_GRID_CELL_SIZE);
      const rows = Math.ceil(META.sourceHeight / SOM_GRID_CELL_SIZE);
      const expected = Math.min(cols * rows, SOM_MAX_ENTRIES);
      expect(out.entries).toHaveLength(expected);
      expect(out.entries[0]?.source).toBe('grid');
      expect(out.entries[0]?.number).toBe(1);
      expect(out.entries[0]?.label).toBe('');
    });

    it('UIA 空数组也走网格兜底', () => {
      const out = buildSomEntries({ meta: META, uiaElements: [] });
      expect(out.fallbackToGrid).toBe(true);
      expect(out.entries.length).toBeGreaterThan(0);
    });

    it('网格中心点位于真实屏幕物理坐标系（含 origin 偏移）', () => {
      const out = buildSomEntries({ meta: META });
      const first = out.entries[0]!;
      // 第一格原点即 origin
      expect(first.rect.x).toBe(META.originX);
      expect(first.rect.y).toBe(META.originY);
      // 中心 = 原点 + 半格
      const cellW = Math.ceil(META.sourceWidth / Math.ceil(META.sourceWidth / SOM_GRID_CELL_SIZE));
      expect(first.center.x).toBe(META.originX + Math.round(cellW / 2));
    });

    it('网格兜底 entriesText 同样含坐标表', () => {
      const out = buildSomEntries({ meta: META });
      expect(out.entriesText).toContain('编号→坐标表');
      expect(out.entriesText).toContain(`共 ${out.entries.length} 项`);
    });

    it('源区域异常（0）时返回空数组不抛错', () => {
      const bad: SomMeta = { ...META, sourceWidth: 0, sourceHeight: 0 };
      const out = buildSomEntries({ meta: bad });
      expect(out.entries).toHaveLength(0);
    });
  });

  describe('坐标映射', () => {
    it('sourceToImage：物理→成品图坐标按缩放比+原点偏移', () => {
      const r = sourceToImage(rect(300, 250, 200, 100), META);
      // (300-100)*0.5=100, (250-50)*0.5=100, 200*0.5=100, 100*0.5=50
      expect(r).toEqual({ x: 100, y: 100, width: 100, height: 50 });
    });

    it('imageToSource：成品图坐标→真实屏幕物理坐标（点击还原）', () => {
      const p = imageToSource({ x: 100, y: 100 }, META);
      expect(p).toEqual({ x: 300, y: 250 });
    });

    it('sourceToImage 与 imageToSource 互逆', () => {
      const orig = rect(300, 250, 200, 100);
      const img = sourceToImage(orig, META);
      const back = imageToSource({ x: img.x, y: img.y }, META);
      expect(back).toEqual({ x: orig.x, y: orig.y });
    });
  });

  describe('formatEntriesText', () => {
    it('空 entries 返回兜底文案', () => {
      expect(formatEntriesText([])).toBe('（无可标记区域）');
    });

    it('含 UIA 标签与中心坐标', () => {
      const txt = formatEntriesText([
        { number: 1, label: '保存 Button', rect: rect(100, 50, 80, 30), center: { x: 140, y: 65 }, source: 'uia' },
      ]);
      expect(txt).toContain('编号→坐标表（共 1 项');
      expect(txt).toContain('#1 [保存 Button] 中心(140,65) 80x30');
    });

    it('网格条目无标签时只渲染编号', () => {
      const txt = formatEntriesText([
        { number: 5, label: '', rect: rect(100, 50, 180, 180), center: { x: 190, y: 140 }, source: 'grid' },
      ]);
      expect(txt).toContain('#5 中心(190,140) 180x180');
      expect(txt).not.toContain('#5 [');
    });
  });
});
