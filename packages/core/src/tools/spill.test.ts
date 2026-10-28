import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { maybeSpillOutput, readSpill, spillHash, SPILL_THRESHOLD_CHARS } from './spill';

describe('v2.9 大工具输出溢出', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-spill-'));
    setDataRootForTest(root);
  });

  afterEach(() => resetDataRootForTest());

  it('超过阈值写入内容寻址文件，模型只看到预览 + spill 引用', () => {
    const output = '甲'.repeat(SPILL_THRESHOLD_CHARS + 1);
    const result = maybeSpillOutput(output);
    expect(result.ref).toBe(`spill://${spillHash(output)}`);
    expect(result.output.length).toBeLessThan(output.length);
    expect(result.output).toContain(result.ref!);
    expect(readSpill(spillHash(output))).toBe(output);
    expect(readSpill('../../etc/passwd')).toBeNull();
    expect(readSpill('a'.repeat(64))).toBeNull();
  });

  it('未超阈值不落盘；同内容重复溢出只写一份', () => {
    expect(maybeSpillOutput('短输出')).toEqual({ output: '短输出', ref: null });

    const output = '乙'.repeat(SPILL_THRESHOLD_CHARS + 10);
    maybeSpillOutput(output);
    maybeSpillOutput(output);
    const dir = join(root, 'spills');
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir)).toHaveLength(1);
  });
});
