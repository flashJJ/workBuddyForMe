import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * vi.hoisted 保证 mock 回调在工厂提升执行前已初始化：
 * 普通 const 在 vi.mock 工厂（被提升到 import 之前）执行时仍处于 TDZ。
 */
const m = vi.hoisted(() => ({
  loadURL: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  showInactive: vi.fn(),
  isDestroyed: vi.fn(() => false),
  ctor: vi.fn(),
  once: vi.fn((_event: string, cb: () => void) => {
    cb(); // 默认同步触发 ready-to-show
  }),
  webContentsOn: vi.fn(),
  getAllDisplays: vi.fn(),
  getPrimaryDisplay: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation((options: BrowserWindowConstructorOptions) => {
    m.ctor(options);
    return {
      loadURL: m.loadURL,
      setAlwaysOnTop: m.setAlwaysOnTop,
      showInactive: m.showInactive,
      isDestroyed: m.isDestroyed,
      once: m.once,
      webContents: { on: m.webContentsOn },
    };
  }),
  screen: {
    getAllDisplays: m.getAllDisplays,
    getPrimaryDisplay: m.getPrimaryDisplay,
  },
}));

import {
  PET_WINDOW_HEIGHT,
  PET_WINDOW_WIDTH,
  buildPetUrl,
  buildPetWindowOptions,
  createPetWindow,
  isCursorOverPet,
  resolvePetPosition,
} from './pet-window';

const primary = { x: 0, y: 0, width: 1920, height: 1040 };

beforeEach(() => {
  vi.clearAllMocks();
  m.isDestroyed.mockReturnValue(false);
  m.once.mockImplementation((_event: string, cb: () => void) => {
    cb();
  });
  m.getAllDisplays.mockReturnValue([{ workArea: primary }]);
  m.getPrimaryDisplay.mockReturnValue({ workArea: primary });
});

describe('buildPetWindowOptions 透明窗安全配置', () => {
  it('透明/无边框/置顶/不进任务栏 + 安全三件套', () => {
    const options = buildPetWindowOptions(100, 200, null);
    expect(options.x).toBe(100);
    expect(options.y).toBe(200);
    expect(options.width).toBe(PET_WINDOW_WIDTH);
    expect(options.height).toBe(PET_WINDOW_HEIGHT);
    expect(options.frame).toBe(false);
    expect(options.transparent).toBe(true);
    expect(options.alwaysOnTop).toBe(true);
    expect(options.skipTaskbar).toBe(true);
    expect(options.resizable).toBe(false);
    expect(options.show).toBe(false);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.preload).toMatch(/preload/);
  });

  it('生产态透传 token/baseUrl 注入参数', () => {
    const options = buildPetWindowOptions(0, 0, {
      url: 'http://127.0.0.1:59999',
      token: 'pet-secret',
    });
    expect(options.webPreferences?.additionalArguments).toEqual([
      '--wbfm-token=pet-secret',
      '--wbfm-base-url=http://127.0.0.1:59999',
    ]);
  });
});

describe('buildPetUrl', () => {
  it('白名单模型进 query，未知/缺省回落 haru', () => {
    expect(buildPetUrl('http://127.0.0.1:3000', 'hiyori')).toBe(
      'http://127.0.0.1:3000/pet?model=hiyori',
    );
    expect(buildPetUrl('http://127.0.0.1:3000', undefined)).toBe(
      'http://127.0.0.1:3000/pet?model=haru',
    );
    expect(buildPetUrl('http://127.0.0.1:3000', '../evil')).toBe(
      'http://127.0.0.1:3000/pet?model=haru',
    );
  });
});

describe('resolvePetPosition', () => {
  it('有效记忆坐标使用之；越界坐标回落主屏右下', () => {
    expect(resolvePetPosition({ x: 300, y: 400, clickThrough: true }, [primary], primary)).toEqual({
      x: 300,
      y: 400,
    });
    const fallback = resolvePetPosition({ x: 9999, y: 9999, clickThrough: true }, [primary], primary);
    expect(fallback.x).toBe(1920 - PET_WINDOW_WIDTH - 24);
    expect(fallback.y).toBe(1040 - PET_WINDOW_HEIGHT - 24);
  });
});

describe('isCursorOverPet 主进程命中（窗口 260×340 @ 1500,800）', () => {
  const bounds = { x: 1500, y: 800, width: 260, height: 340 };
  it('命中列内为 true（含负坐标窗口也可算）', () => {
    // 命中列：x ∈ [1500+39, 1500+221]，y ∈ [800+37.4, 800+340]
    expect(isCursorOverPet({ x: 1630, y: 1000 }, bounds)).toBe(true);
    expect(isCursorOverPet({ x: 1539, y: 838 }, bounds)).toBe(true);
  });
  it('左右外围、顶部留白带、窗口外均为 false', () => {
    expect(isCursorOverPet({ x: 1510, y: 1000 }, bounds)).toBe(false);
    expect(isCursorOverPet({ x: 1750, y: 1000 }, bounds)).toBe(false);
    expect(isCursorOverPet({ x: 1630, y: 810 }, bounds)).toBe(false);
    expect(isCursorOverPet({ x: 100, y: 100 }, bounds)).toBe(false);
  });
  it('窗口拖动后 bounds 变化，判定跟随（验证用的是实时 getBounds 而非缓存）', () => {
    const moved = { x: 200, y: 600, width: 260, height: 340 };
    expect(isCursorOverPet({ x: 330, y: 800 }, moved)).toBe(true);
    expect(isCursorOverPet({ x: 330, y: 800 }, bounds)).toBe(false);
  });
  it('异常尺寸安全返回 false', () => {
    expect(isCursorOverPet({ x: 1, y: 1 }, { x: 0, y: 0, width: 0, height: 0 })).toBe(false);
  });
});

describe('createPetWindow', () => {
  it('以安全选项造窗、screen-saver 置顶、showInactive 显示、加载 /pet?model', () => {
    const win = createPetWindow(
      { url: 'http://127.0.0.1:59999', token: 't' },
      { x: 120, y: 220, clickThrough: true },
      'mao',
    );
    expect(win).toBeTruthy();
    const passed = m.ctor.mock.calls[0]?.[0] as BrowserWindowConstructorOptions;
    expect(passed.transparent).toBe(true);
    expect(passed.frame).toBe(false);
    expect(m.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(m.showInactive).toHaveBeenCalledTimes(1);
    expect(m.loadURL).toHaveBeenCalledWith('http://127.0.0.1:59999/pet?model=mao');
  });

  it('开发态无 boot 时加载 DEV_SERVER_URL，模型缺省 haru', () => {
    createPetWindow(null, { clickThrough: true }, undefined);
    expect(m.loadURL).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/pet\?model=haru$/),
    );
  });
});
