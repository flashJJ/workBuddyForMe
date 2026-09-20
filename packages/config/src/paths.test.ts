import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DATA_DIR_NAME,
  getDataRoot,
  resetDataRootForTest,
  resolveDataPath,
  setDataRootForTest,
} from './paths';

describe('getDataRoot 优先级', () => {
  const originalEnv = process.env.WBFM_DATA_ROOT;

  beforeEach(() => {
    resetDataRootForTest();
  });

  afterEach(() => {
    resetDataRootForTest();
    if (originalEnv === undefined) delete process.env.WBFM_DATA_ROOT;
    else process.env.WBFM_DATA_ROOT = originalEnv;
  });

  it('测试注入优先于环境变量与默认值', () => {
    process.env.WBFM_DATA_ROOT = 'C:/from-env';
    const temp = mkdtempSync(join(tmpdir(), 'wbfm-root-'));
    setDataRootForTest(temp);
    expect(getDataRoot()).toBe(temp);
  });

  it('环境变量优先于默认目录', () => {
    process.env.WBFM_DATA_ROOT = 'C:/from-env';
    expect(getDataRoot()).toBe('C:/from-env');
  });

  it('未配置时回落到 ~/.workbuddy-for-me', () => {
    delete process.env.WBFM_DATA_ROOT;
    expect(getDataRoot().replace(/\\/g, '/')).toContain(DATA_DIR_NAME);
  });

  it('空白环境变量视为未设置', () => {
    process.env.WBFM_DATA_ROOT = '   ';
    expect(getDataRoot()).toContain(DATA_DIR_NAME);
  });

  it('resolveDataPath 基于数据根拼接', () => {
    const temp = mkdtempSync(join(tmpdir(), 'wbfm-root-'));
    setDataRootForTest(temp);
    expect(resolveDataPath('db', 'x.sqlite')).toBe(join(temp, 'db', 'x.sqlite'));
  });
});
