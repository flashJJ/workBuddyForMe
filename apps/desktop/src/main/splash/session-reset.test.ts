import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearStorageData } = vi.hoisted(() => ({
  clearStorageData: vi.fn(async () => undefined),
}));
vi.mock('electron', () => ({ session: { defaultSession: { clearStorageData } } }));

import { clearSessionIfVersionChanged, resolveIntroMode, writeIntroSeen } from './session-reset';

const tempDirs: string[] = [];

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-session-reset-'));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  vi.clearAllMocks();
  tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe('clearSessionIfVersionChanged', () => {
  it('首次安装写标记并返回 true，不清理 session', async () => {
    const dir = makeDir();
    await expect(clearSessionIfVersionChanged(dir, '4.5.0')).resolves.toBe(true);
    expect(fs.readFileSync(path.join(dir, 'last-version'), 'utf8')).toBe('4.5.0');
    expect(clearStorageData).not.toHaveBeenCalled();
  });

  it('同版本返回 false，不清理', async () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, 'last-version'), '4.5.0', 'utf8');
    await expect(clearSessionIfVersionChanged(dir, '4.5.0')).resolves.toBe(false);
    expect(clearStorageData).not.toHaveBeenCalled();
  });

  it('版本变化清理 session 并返回 true', async () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, 'last-version'), '4.4.0', 'utf8');
    await expect(clearSessionIfVersionChanged(dir, '4.5.0')).resolves.toBe(true);
    expect(clearStorageData).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(path.join(dir, 'last-version'), 'utf8')).toBe('4.5.0');
  });
});

describe('intro-seen-version', () => {
  it('没有标记时播完整片', () => {
    expect(resolveIntroMode(makeDir(), '4.5.0')).toBe('full');
  });

  it('同版本已看过时播精简版', () => {
    const dir = makeDir();
    writeIntroSeen(dir, '4.5.0');
    expect(resolveIntroMode(dir, '4.5.0')).toBe('compact');
  });

  it('版本变化时重新播完整片', () => {
    const dir = makeDir();
    writeIntroSeen(dir, '4.4.0');
    expect(resolveIntroMode(dir, '4.5.0')).toBe('full');
  });

  it('last-version 已写但 intro 未写时仍播完整片（安装器自动拉起的兜底）', async () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, 'last-version'), '4.5.0', 'utf8');
    expect(resolveIntroMode(dir, '4.5.0')).toBe('full');
  });
});
