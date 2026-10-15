import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STAGE_STATE, loadStageState, saveStageState } from './stage-state';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-stage-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('v1.9 舞台窗状态持久化', () => {
  it('缺省文件回落默认（全屏、无 bounds）', () => {
    expect(loadStageState(dir)).toEqual(DEFAULT_STAGE_STATE);
  });

  it('损坏 JSON 回落默认', () => {
    fs.writeFileSync(path.join(dir, 'stage-state.json'), '{bad json', 'utf8');
    expect(loadStageState(dir)).toEqual(DEFAULT_STAGE_STATE);
  });

  it('窗口化 bounds 往返', () => {
    saveStageState(dir, { fullscreen: false, bounds: { x: 12, y: 34, width: 1200, height: 800 } });
    expect(loadStageState(dir).bounds).toEqual({ x: 12, y: 34, width: 1200, height: 800 });
  });

  it('非法/过小 bounds 被丢弃', () => {
    fs.writeFileSync(
      path.join(dir, 'stage-state.json'),
      JSON.stringify({ fullscreen: false, bounds: { x: 0, y: 0, width: 10, height: 10 } }),
      'utf8',
    );
    expect(loadStageState(dir).bounds).toBeNull();
  });
});
