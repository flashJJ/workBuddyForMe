import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDataRootForTest, setDataRootForTest } from './paths';
import { DATA_SUBDIRS, ensureDataDirs, getDatabasePath, getDataDir } from './dirs';

describe('数据目录初始化', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-dirs-'));
    setDataRootForTest(tempRoot);
  });

  afterEach(() => {
    resetDataRootForTest();
  });

  it('ensureDataDirs 创建全部标准子目录且幂等', () => {
    const first = ensureDataDirs();
    const keys = Object.keys(DATA_SUBDIRS);
    expect(keys).toHaveLength(keys.length);
    for (const key of keys as (keyof typeof DATA_SUBDIRS)[]) {
      expect(existsSync(first[key])).toBe(true);
    }
    expect(() => ensureDataDirs()).not.toThrow();
  });

  it('getDatabasePath 指向 db 子目录', () => {
    expect(getDatabasePath()).toBe(join(tempRoot, DATA_SUBDIRS.db, 'wbfm.sqlite'));
  });

  it('getDataDir 解析嵌套缓存目录', () => {
    expect(getDataDir('embeddingsCache').split(/[\\/]/)).toEqual(
      expect.arrayContaining(['cache', 'embeddings']),
    );
  });
});
