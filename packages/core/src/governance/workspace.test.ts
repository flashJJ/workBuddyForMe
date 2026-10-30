import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@wbfm/shared/errors';
import {
  assertPathInsideWorkspace,
  isPathInside,
  isSensitivePath,
  resolveWorkspacePath,
} from './workspace';

describe('工作目录校验（v2.13 M1）', () => {
  let root: string;
  let workspace: string;
  let dataRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-workspace-'));
    workspace = join(root, 'work');
    dataRoot = join(root, 'appdata');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(dataRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('合法目录返回 realpath，并拒绝相对路径 / 文件 / 不存在', () => {
    expect(resolveWorkspacePath(workspace, { dataRoot })).toBe(workspace);
    expect(() => resolveWorkspacePath('relative/path', { dataRoot })).toThrow(ApiError);
    const file = join(root, 'file.txt');
    writeFileSync(file, 'x');
    expect(() => resolveWorkspacePath(file, { dataRoot })).toThrow(ApiError);
    expect(() => resolveWorkspacePath(join(root, 'missing'), { dataRoot })).toThrow(ApiError);
  });

  it('拒绝应用数据目录与用户主目录根', () => {
    const inside = join(dataRoot, 'nested');
    mkdirSync(inside, { recursive: true });
    expect(() => resolveWorkspacePath(inside, { dataRoot })).toThrow(ApiError);
    expect(() => resolveWorkspacePath(dataRoot, { dataRoot })).toThrow(ApiError);
    expect(() =>
      resolveWorkspacePath(root, { dataRoot, homeDir: root }),
    ).toThrow(ApiError);
  });

  it('isPathInside 支持大小写与边界', () => {
    expect(isPathInside(workspace, workspace)).toBe(true);
    expect(isPathInside(workspace, join(workspace, 'a', 'b'))).toBe(true);
    expect(isPathInside(workspace, join(workspace, '..', 'other'))).toBe(false);
    expect(isPathInside('C:\\work', 'c:\\work\\a', 'win32')).toBe(true);
    expect(isPathInside('C:\\work', 'C:\\workspace', 'win32')).toBe(false);
  });

  it('目标路径必须落在工作目录内，越界抛 WORKSPACE_ESCAPE', () => {
    expect(assertPathInsideWorkspace(workspace, join(workspace, 'out.txt'))).toContain('out.txt');
    try {
      assertPathInsideWorkspace(workspace, join(root, 'outside.txt'));
      expect.unreachable('应当拒绝越界路径');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('FORBIDDEN');
      expect((error as ApiError).details).toEqual({ code: 'WORKSPACE_ESCAPE' });
    }
  });

  it('敏感路径识别', () => {
    expect(isSensitivePath('C:\\Users\\me\\.ssh\\config')).toBe(true);
    expect(isSensitivePath('/home/me/.aws/credentials')).toBe(true);
    expect(isSensitivePath('/home/me/docs/readme.md')).toBe(false);
  });
});
