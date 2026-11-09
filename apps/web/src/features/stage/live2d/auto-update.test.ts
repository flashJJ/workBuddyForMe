import { describe, expect, it } from 'vitest';
import { desiredAutoUpdate, syncAutoUpdate } from './auto-update';

/** 模拟 pld 模型：setter 不去重，因此必须靠差量同步保证只赋值一次 */
function makeModel() {
  let value = false;
  const writes: boolean[] = [];
  return {
    get autoUpdate() {
      return value;
    },
    set autoUpdate(next: boolean) {
      value = next;
      writes.push(next);
    },
    writes,
  };
}

describe('舞台 Live2D autoUpdate 差量同步', () => {
  it('重复目标 true 只赋值一次（拖动重渲染不会叠加 ticker）', () => {
    const model = makeModel();
    let applied: boolean | null = null;
    for (let i = 0; i < 20; i += 1) {
      applied = syncAutoUpdate(model, applied, true);
    }
    expect(model.writes).toEqual([true]);
    expect(applied).toBe(true);
  });

  it('true → false → true 各触发一次赋值', () => {
    const model = makeModel();
    let applied: boolean | null = null;
    applied = syncAutoUpdate(model, applied, true);
    applied = syncAutoUpdate(model, applied, true);
    applied = syncAutoUpdate(model, applied, false);
    applied = syncAutoUpdate(model, applied, false);
    applied = syncAutoUpdate(model, applied, true);
    expect(model.writes).toEqual([true, false, true]);
    expect(applied).toBe(true);
  });

  it('powerMode/focus 组合决定是否更新', () => {
    expect(desiredAutoUpdate('live', null, 'left')).toBe(true);
    expect(desiredAutoUpdate('portrait', 'center', 'center')).toBe(true);
    expect(desiredAutoUpdate('portrait', 'center', 'left')).toBe(false);
    expect(desiredAutoUpdate('portrait', null, 'left')).toBe(false);
  });
});
