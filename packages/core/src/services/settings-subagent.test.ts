import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  resolveSubagentCliArgs,
  resolveSubagentCliMaxOutputBytes,
  resolveSubagentCliTimeoutMs,
} from './settings-service';

describe('v2.11 外部代理设置钳制', () => {
  it('默认关闭且不配置命令', () => {
    expect(DEFAULT_SETTINGS.subagentCliEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.subagentCliCommand).toBe('');
    expect(DEFAULT_SETTINGS.subagentCliArgs).toEqual([]);
  });

  it('参数：截断超长/超额项与非法类型', () => {
    const args = resolveSubagentCliArgs([
      'a'.repeat(300),
      ...Array.from({ length: 12 }, (_, index) => `arg-${index}`),
      123,
    ]);
    expect(args).toHaveLength(10);
    expect(args[0]).toBe('a'.repeat(200));
    expect(resolveSubagentCliArgs('not-array')).toEqual([]);
  });

  it('超时与输出上限：越界钳制，非法回落默认', () => {
    expect(resolveSubagentCliTimeoutMs(1)).toBe(60_000);
    expect(resolveSubagentCliTimeoutMs(10_000_000)).toBe(1_800_000);
    expect(resolveSubagentCliTimeoutMs('x')).toBe(600_000);
    expect(resolveSubagentCliMaxOutputBytes(1)).toBe(65_536);
    expect(resolveSubagentCliMaxOutputBytes(99_999_999)).toBe(8_388_608);
    expect(resolveSubagentCliMaxOutputBytes(null)).toBe(2_097_152);
  });
});
