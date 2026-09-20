import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { BrowserWindowConstructorOptions } from 'electron';

const loadURlMock = vi.fn();
const onMock = vi.fn();
const ctorMock = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation((options: BrowserWindowConstructorOptions) => {
    ctorMock(options);
    return {
      loadURL: loadURlMock,
      on: onMock,
      once: onMock,
      webContents: { setWindowOpenHandler: vi.fn() },
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      show: vi.fn(),
      getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1080, height: 720 })),
    };
  }),
  shell: { openExternal: vi.fn() },
}));

import { buildWindowOptions, createMainWindow } from './window';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildWindowOptions 安全配置', () => {
  it('contextIsolation/nodeIntegration/sandbox 等安全开关全部正确（TR-29.1）', () => {
    const options = buildWindowOptions('/tmp/userdata', null);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.webSecurity).toBe(true);
    expect(options.webPreferences?.preload).toMatch(/preload/);
    expect(options.show).toBe(false);
  });

  it('生产态通过 additionalArguments 注入 token 与 baseUrl', () => {
    const options = buildWindowOptions('/tmp/userdata', {
      url: 'http://127.0.0.1:51234',
      token: 'secret-token',
    });
    const args = options.webPreferences?.additionalArguments ?? [];
    expect(args).toContain('--wbfm-token=secret-token');
    expect(args).toContain('--wbfm-base-url=http://127.0.0.1:51234');
  });
});

describe('createMainWindow', () => {
  it('使用安全选项创建窗口并加载托管地址', () => {
    createMainWindow('/tmp/userdata', 'http://127.0.0.1:51234', {
      url: 'http://127.0.0.1:51234',
      token: 't',
    });
    expect(ctorMock).toHaveBeenCalledTimes(1);
    const passed = ctorMock.mock.calls[0]?.[0] as BrowserWindowConstructorOptions;
    expect(passed.webPreferences?.contextIsolation).toBe(true);
    expect(loadURlMock).toHaveBeenCalledWith('http://127.0.0.1:51234');
  });
});
