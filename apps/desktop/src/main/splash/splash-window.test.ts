import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
}));

import {
  buildSplashWindowOptions,
  createBootSplash,
  resolveSplashHtmlPath,
} from './splash-window';

const originalSplashHtml = process.env.WBFM_SPLASH_HTML;

afterEach(() => {
  vi.clearAllMocks();
  if (originalSplashHtml === undefined) delete process.env.WBFM_SPLASH_HTML;
  else process.env.WBFM_SPLASH_HTML = originalSplashHtml;
});

describe('buildSplashWindowOptions', () => {
  it('固定 640x360、无边框不透明、跳过任务栏', () => {
    const options = buildSplashWindowOptions({ html: 'index.html', preload: 'splash.js' });
    expect(options.width).toBe(640);
    expect(options.height).toBe(360);
    expect(options.show).toBe(false);
    expect(options.frame).toBe(false);
    expect(options.transparent).toBe(false);
    expect(options.resizable).toBe(false);
    expect(options.skipTaskbar).toBe(true);
    expect(options.backgroundColor).toBe('#0F1115');
  });

  it('安全开关与专用 preload 不被放开', () => {
    const options = buildSplashWindowOptions({ html: 'index.html', preload: '/tmp/splash.js' });
    expect(options.webPreferences).toMatchObject({
      preload: '/tmp/splash.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false,
    });
  });
});

describe('resolveSplashHtmlPath', () => {
  it('允许 WBFM_SPLASH_HTML 覆盖，便于开发预览', () => {
    process.env.WBFM_SPLASH_HTML = 'E:/tmp/splash/index.html';
    expect(resolveSplashHtmlPath(false)).toBe('E:/tmp/splash/index.html');
  });
});

describe('createBootSplash', () => {
  it('disabled 时返回空实现，不创建窗口', () => {
    const splash = createBootSplash({
      enabled: false,
      paths: { html: 'index.html', preload: 'splash.js' },
    });
    expect(splash.enabled).toBe(false);
    expect(() => splash.setMode({
      intro: 'compact',
      lang: 'zh',
      version: '4.5.0',
      labels: {
        prepare: '',
        server: '',
        workspace: '',
        waiting: '',
        slow: '',
        verySlow: '',
        failed: '',
        failedHint: '',
        skip: '',
        version: '',
      },
      timing: { minVisibleMs: 500, maxIntroMs: 9000 },
    })).not.toThrow();
  });
});
