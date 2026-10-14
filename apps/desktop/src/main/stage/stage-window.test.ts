import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  loadURL: vi.fn(),
  isDestroyed: vi.fn(() => false),
  show: vi.fn(),
  ctor: vi.fn(),
  once: vi.fn((_event: string, cb: () => void) => {
    cb();
  }),
  getPrimaryDisplay: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation((options: unknown) => {
    m.ctor(options);
    return {
      loadURL: m.loadURL,
      isDestroyed: m.isDestroyed,
      show: m.show,
      once: m.once,
      webContents: { on: vi.fn() },
      on: vi.fn(),
    };
  }),
  screen: { getPrimaryDisplay: m.getPrimaryDisplay },
}));

import { buildStageUrl, buildStageWindowOptions, createStageWindow } from './stage-window';

const primary = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } };

beforeEach(() => {
  vi.clearAllMocks();
  m.isDestroyed.mockReturnValue(false);
  m.once.mockImplementation((_event: string, cb: () => void) => {
    cb();
  });
  m.getPrimaryDisplay.mockReturnValue(primary);
});

describe('v1.9 舞台窗选项', () => {
  it('默认全屏黑底、有最小尺寸、安全三件套与主/桌宠一致', () => {
    const opts = buildStageWindowOptions(null, true, null);
    expect(opts.fullscreen).toBe(true);
    expect(opts.backgroundColor).toBe('#000000');
    expect(opts.minWidth).toBeGreaterThan(0);
    expect(opts.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });

  it('窗口化时使用持久化 bounds，不强制全屏', () => {
    const bounds = { x: 100, y: 80, width: 1400, height: 900 };
    const opts = buildStageWindowOptions(null, false, bounds);
    expect(opts.fullscreen).toBe(false);
    expect(opts).toMatchObject(bounds);
  });

  it('托管 boot 令牌经 additionalArguments 透传', () => {
    const opts = buildStageWindowOptions(
      { url: 'http://127.0.0.1:3100', token: 'tk-1' },
      true,
      null,
    );
    expect(opts.webPreferences?.additionalArguments).toEqual([
      '--wbfm-token=tk-1',
      '--wbfm-base-url=http://127.0.0.1:3100',
    ]);
  });

  it('createStageWindow 加载 /stage 且 ready-to-show 后显示', () => {
    const win = createStageWindow({ url: 'http://127.0.0.1:3100' }, true, null);
    expect(m.loadURL).toHaveBeenCalledWith('http://127.0.0.1:3100/stage');
    expect(m.show).toHaveBeenCalled();
    expect(win).toBeTruthy();
  });

  it('v1.9 M2/M3：runId/meetingId 直达对应舞台现场，并做 URL 编码', () => {
    expect(buildStageUrl('http://127.0.0.1:3100', { runId: 'run_1-2' })).toBe(
      'http://127.0.0.1:3100/stage?run=run_1-2',
    );
    expect(buildStageUrl('http://127.0.0.1:3100', { meetingId: 'mtg-9' })).toBe(
      'http://127.0.0.1:3100/stage?meeting=mtg-9',
    );
    // meeting 优先（互斥目标，防御）
    expect(
      buildStageUrl('http://127.0.0.1:3100', { runId: 'r', meetingId: 'm' }),
    ).toBe('http://127.0.0.1:3100/stage?meeting=m');
    expect(buildStageUrl('http://127.0.0.1:3100')).toBe('http://127.0.0.1:3100/stage');
    createStageWindow({ url: 'http://127.0.0.1:3100' }, true, null, { runId: 'run-9' });
    expect(m.loadURL).toHaveBeenCalledWith('http://127.0.0.1:3100/stage?run=run-9');
  });
});
