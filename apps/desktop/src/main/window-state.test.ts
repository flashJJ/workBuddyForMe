import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW_STATE,
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
