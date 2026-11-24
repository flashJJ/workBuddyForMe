import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SettingsRepository } from '@wbfm/database';
import { createFileGuard, type FileGuard } from '../file-guard';

/** v5.1 M3：应用层路径守卫的越界矩阵 */

function memorySettings(): SettingsRepository {
  const map = new Map<string, unknown>();
  return {
    getJson: (key: string, fallback: unknown) => (map.has(key) ? map.get(key) : fallback),
    setJson: (key: string, value: unknown) => {
      map.set(key, value);
    },
  } as unknown as SettingsRepository;
}

function errorCode(fn: () => void): string {
  try {
    fn();
    return 'none';
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('v5.1 文件路径守卫', () => {
  let tempRoot: string;
  let dataRoot: string;
  let userRoot: string;
  let guard: FileGuard;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-guard-'));
    dataRoot = join(tempRoot, 'data');
    userRoot = join(tempRoot, 'projects');
    mkdirSync(userRoot, { recursive: true });
    guard = createFileGuard({ dataRoot, settings: memorySettings() });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('默认工作区内允许，不要求文件已存在', () => {
    const target = join(guard.defaultRoot, 'notes', 'a.md');
    expect(guard.assertAllowed(target)).toBe(target);
    expect(guard.isAllowed(target)).toBe(true);
    expect(guard.listRoots()[0]).toBe(guard.defaultRoot);
  });

  it('工作区外、数据根与其他盘符被拒绝', () => {
    expect(errorCode(() => guard.assertAllowed(join(tempRoot, 'outside.txt')))).toBe(
      'FILE_PATH_OUTSIDE_WORKSPACE',
    );
    expect(errorCode(() => guard.assertAllowed(join(dataRoot, 'db.sqlite')))).toBe(
      'FILE_PATH_OUTSIDE_WORKSPACE',
    );
    expect(errorCode(() => guard.assertAllowed(parse(dataRoot).root))).toBe(
      'FILE_PATH_OUTSIDE_WORKSPACE',
    );
  });

  it('相对路径与 UNC 返回 FILE_PATH_INVALID', () => {
    expect(errorCode(() => guard.assertAllowed('relative/a.txt'))).toBe('FILE_PATH_INVALID');
    expect(errorCode(() => guard.assertAllowed('\\\\server\\share\\a.txt'))).toBe(
      'FILE_PATH_INVALID',
    );
  });

  it('`..` 逃逸被规范化后拒绝', () => {
    const escaped = join(guard.defaultRoot, '..', '..', 'outside.txt');
    expect(guard.isAllowed(escaped)).toBe(false);
  });

  it('用户追加根生效，数量与存在性受限', () => {
    const roots = guard.setRoots([userRoot]);
    expect(roots).toEqual([guard.defaultRoot, userRoot]);
    expect(guard.assertAllowed(join(userRoot, 'doc.txt'))).toBe(join(userRoot, 'doc.txt'));

    expect(() => guard.setRoots([join(tempRoot, 'missing')])).toThrow(/授权根不存在/);
    const tooMany = Array.from({ length: 9 }, (_, index) => join(userRoot, `sub-${index}`));
    expect(() => guard.setRoots(tooMany)).toThrow(/最多 8 个/);
    expect(errorCode(() => guard.setRoots([dataRoot]))).toBe('VALIDATION_ERROR');
  });

  it('符号链接逃逸被拒绝（环境不支持链接时跳过）', () => {
    const outside = join(tempRoot, 'outside-dir');
    mkdirSync(outside, { recursive: true });
    const link = join(guard.defaultRoot, 'escape');
    try {
      symlinkSync(outside, link, 'junction');
    } catch {
      return;
    }
    expect(guard.isAllowed(join(link, 'secret.txt'))).toBe(false);
  });
});
