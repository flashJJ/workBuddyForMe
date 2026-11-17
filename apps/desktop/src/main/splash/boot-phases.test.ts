import { describe, expect, it } from 'vitest';
import {
  createPhaseEvent,
  FULL_INTRO_MAX_MS,
  introModeFor,
  phaseForStage,
  shouldExit,
} from './boot-phases';

describe('phaseForStage', () => {
  it('将内部 stage 收敛为三个用户阶段', () => {
    expect(phaseForStage('app-ready')).toBe('prepare');
    expect(phaseForStage('session-cleared')).toBe('prepare');
    expect(phaseForStage('cipher-ready')).toBe('prepare');
    expect(phaseForStage('server-forked')).toBe('server');
    expect(phaseForStage('server-healthy')).toBe('server');
    expect(phaseForStage('main-created')).toBe('workspace');
    expect(phaseForStage('main-ready')).toBe('workspace');
  });
});

describe('createPhaseEvent', () => {
  it('索引固定为 0..2，总数 3', () => {
    expect(createPhaseEvent('prepare', 12)).toEqual({ id: 'prepare', index: 0, total: 3, atMs: 12 });
    expect(createPhaseEvent('server', 34)).toMatchObject({ index: 1, total: 3 });
    expect(createPhaseEvent('workspace', 56)).toMatchObject({ index: 2, total: 3 });
  });
});

describe('introModeFor', () => {
  it('首次安装与版本变化播完整片，同版本播精简版', () => {
    expect(introModeFor(null, '4.5.0')).toBe('full');
    expect(introModeFor('4.4.0', '4.5.0')).toBe('full');
    expect(introModeFor('4.5.0', '4.5.0')).toBe('compact');
  });
});

describe('shouldExit', () => {
  const base = { mainReady: true, elapsedMs: 600, introFinished: false };

  it('主窗未就绪时不退场', () => {
    expect(shouldExit({ ...base, mainReady: false, mode: 'compact' })).toBe(false);
    expect(shouldExit({ ...base, mainReady: false, mode: 'full' })).toBe(false);
  });

  it('日常至少可见 500ms', () => {
    expect(shouldExit({ ...base, elapsedMs: 300, mode: 'compact' })).toBe(false);
    expect(shouldExit({ ...base, elapsedMs: 500, mode: 'compact' })).toBe(true);
  });

  it('首启等到片尾或 9s 上限', () => {
    expect(shouldExit({ ...base, mode: 'full', elapsedMs: 3_000 })).toBe(false);
    expect(shouldExit({ ...base, mode: 'full', elapsedMs: 3_000, introFinished: true })).toBe(true);
    expect(shouldExit({ ...base, mode: 'full', elapsedMs: FULL_INTRO_MAX_MS })).toBe(true);
  });
});
