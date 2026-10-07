import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PET_DEFAULT_MARGIN,
  clampIntoDisplay,
  defaultPetPosition,
  loadPetState,
  savePetState,
  type Rect,
} from './pet-state';

const SIZE = { width: 260, height: 340 };
const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const SECONDARY: Rect = { x: 1920, y: 0, width: 1920, height: 1040 };

describe('pet-state 持久化', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-pet-state-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('缺省文件回落默认（穿透开）', () => {
    const state = loadPetState(dir);
    expect(state).toEqual({ x: undefined, y: undefined, clickThrough: true });
  });

  it('保存后可回读位置与穿透偏好', () => {
    savePetState(dir, { x: 100, y: 200, clickThrough: false });
    expect(loadPetState(dir)).toEqual({ x: 100, y: 200, clickThrough: false });
  });

  it('损坏 JSON / 非法字段回落默认', () => {
    fs.writeFileSync(path.join(dir, 'pet-state.json'), '{not-json', 'utf8');
    expect(loadPetState(dir).clickThrough).toBe(true);

    fs.writeFileSync(
      path.join(dir, 'pet-state.json'),
      JSON.stringify({ x: 'bad', y: null, clickThrough: 'yes' }),
      'utf8',
    );
    expect(loadPetState(dir)).toEqual({ x: undefined, y: undefined, clickThrough: true });
  });
});

describe('clampIntoDisplay 多屏定位', () => {
  it('主屏内的有效坐标按边缘留白 clamp', () => {
    const pos = clampIntoDisplay({ x: 100, y: 100 }, SIZE, [PRIMARY], PRIMARY);
    expect(pos).toEqual({ x: 100, y: 100 });
  });

  it('贴右下超出部分被夹回工作区内', () => {
    const pos = clampIntoDisplay({ x: 1900, y: 1030 }, SIZE, [PRIMARY], PRIMARY);
    expect(pos.x).toBe(1920 - 260 - 8);
    expect(pos.y).toBe(1040 - 340 - 8);
  });

  it('落在副屏（含负坐标场景由右侧屏模拟）保持在副屏内 clamp', () => {
    const pos = clampIntoDisplay({ x: 2000, y: 100 }, SIZE, [PRIMARY, SECONDARY], PRIMARY);
    expect(pos.x).toBe(2000);
    expect(pos.y).toBe(100);

    const edge = clampIntoDisplay({ x: 3800, y: 1030 }, SIZE, [PRIMARY, SECONDARY], PRIMARY);
    expect(edge.x).toBe(1920 + 1920 - 260 - 8);
  });

  it('记忆坐标不在任何屏幕（副屏拔走）→ 回落主屏右下默认位', () => {
    const pos = clampIntoDisplay({ x: 2500, y: 100 }, SIZE, [PRIMARY], PRIMARY);
    const expected = defaultPetPosition(PRIMARY, SIZE);
    expect(pos).toEqual(expected);
    expect(pos.x).toBe(1920 - 260 - PET_DEFAULT_MARGIN);
  });

  it('无坐标（首次启动）→ 主屏右下默认位', () => {
    const pos = clampIntoDisplay({}, SIZE, [PRIMARY], PRIMARY);
    expect(pos).toEqual(defaultPetPosition(PRIMARY, SIZE));
  });

  it('无任何屏幕信息时原样返回不抛错', () => {
    expect(clampIntoDisplay({ x: 5, y: 6 }, SIZE, [], null)).toEqual({ x: 5, y: 6 });
    expect(clampIntoDisplay({}, SIZE, [], null)).toEqual({ x: 0, y: 0 });
  });
});
