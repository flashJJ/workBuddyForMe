import { describe, expect, it } from 'vitest';
import {
  SUBAGENT_CLI_ARGS_MAX,
  SUBAGENT_CLI_TIMEOUT_MAX_MS,
  SUBAGENT_CLI_TIMEOUT_MIN_MS,
  subagentRunInputSchema,
  subagentRunListQuerySchema,
} from './subagent';
import { settingsUpdateSchema } from './settings';

describe('v2.11 外部代理契约', () => {
  it('运行输入：goal/cwd 必填，预算有界', () => {
    const parsed = subagentRunInputSchema.parse({ goal: '整理', cwd: 'D:\\work' });
    expect(parsed.goal).toBe('整理');
    expect(subagentRunInputSchema.safeParse({ goal: '', cwd: 'D:\\work' }).success).toBe(false);
    expect(subagentRunInputSchema.safeParse({ goal: 'x', cwd: '' }).success).toBe(false);
    expect(
      subagentRunInputSchema.safeParse({ goal: 'x', cwd: 'D:\\work', budget: { maxRounds: 0 } })
        .success,
    ).toBe(false);
  });

  it('列表 limit 夹在 1–50', () => {
    expect(subagentRunListQuerySchema.parse({ limit: '10' }).limit).toBe(10);
    expect(subagentRunListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(subagentRunListQuerySchema.safeParse({ limit: '99' }).success).toBe(false);
  });

  it('设置字段：参数上限与超时/输出边界', () => {
    expect(
      settingsUpdateSchema.safeParse({
        subagentCliArgs: Array.from({ length: SUBAGENT_CLI_ARGS_MAX + 1 }, () => 'a'),
      }).success,
    ).toBe(false);
    expect(
      settingsUpdateSchema.safeParse({ subagentCliTimeoutMs: SUBAGENT_CLI_TIMEOUT_MIN_MS - 1 })
        .success,
    ).toBe(false);
    expect(
      settingsUpdateSchema.safeParse({ subagentCliTimeoutMs: SUBAGENT_CLI_TIMEOUT_MAX_MS + 1 })
        .success,
    ).toBe(false);
    expect(settingsUpdateSchema.safeParse({ subagentCliMaxOutputBytes: 65_535 }).success).toBe(
      false,
    );
  });
});
