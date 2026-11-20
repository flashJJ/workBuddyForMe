import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW_STATE,
  ensureVisibleWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  loadWindowState,
} from './window-state';

describe('主窗窗口状态', () => {
  it('无状态文件时使用舒适默认尺寸', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wbfm-window-state-'));
    expect(loadWindowState(dir)).toEqual(DEFAULT_WINDOW_STATE);
  });

  it('历史尺寸过小时抬到最小宽高，位置保留', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wbfm-window-state-'));
    writeFileSync(
      path.join(dir, 'window-state.json'),
      JSON.stringify({ x: 10, y: 20, width: 1024, height: 651 }),
      'utf8',
    );
    expect(loadWindowState(dir)).toEqual({
      x: 10,
      y: 20,
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT,
    });
  });
});

describe('ensureVisibleWindowState（显示器变更后的离屏兜底）', () => {
  const display = { x: 0, y: 0, width: 1920, height: 1080 };

  it('历史坐标仍落在显示器内时原样保留', () => {
    const state = { x: 100, y: 80, width: 1280, height: 800 };
    expect(ensureVisibleWindowState(state, [display])).toEqual(state);
  });

  it('扩展屏被拔掉导致完全离屏时丢弃坐标（交给系统居中）', () => {
    const state = { x: 2600, y: 100, width: 1280, height: 800 };
    expect(ensureVisibleWindowState(state, [display])).toEqual({ width: 1280, height: 800 });
  });

  it('仅剩边缘细条可见（<80px）也视为不可用', () => {
    const state = { x: 1900, y: 100, width: 1280, height: 800 };
    expect(ensureVisibleWindowState(state, [display]).x).toBeUndefined();
  });

  it('无显示器信息时不改写状态（无头/测试环境）', () => {
    const state = { x: 10, y: 10, width: 1280, height: 800 };
    expect(ensureVisibleWindowState(state, [])).toEqual(state);
  });
});
