import { describe, expect, it } from 'vitest';
import {
  classifyFailure,
  formatDurationMs,
  isFailureOutcome,
  isLiveOutcome,
  runDurationMs,
  runElapsedMs,
  taskOutcome,
  toOutcome,
} from './run-outcome';

describe('toOutcome：三套运行状态归一（v2.4 P1-1）', () => {
  it('task：六种状态映射，stopped 默认按取消处理', () => {
    expect(toOutcome('task', 'queued')).toBe('queued');
    expect(toOutcome('task', 'running')).toBe('running');
    expect(toOutcome('task', 'paused')).toBe('waiting');
    expect(toOutcome('task', 'completed')).toBe('succeeded');
    expect(toOutcome('task', 'failed')).toBe('failed');
    expect(toOutcome('task', 'stopped')).toBe('cancelled');
  });

  it('task：stopReason 优先于 stopped/failed 状态本身', () => {
    expect(taskOutcome('stopped', 'max_steps')).toBe('budget_exceeded');
    expect(taskOutcome('stopped', 'max_failures')).toBe('budget_exceeded');
    expect(taskOutcome('stopped', 'user_stop')).toBe('cancelled');
    expect(taskOutcome('failed', 'breaker')).toBe('failed');
    expect(taskOutcome('failed', 'error')).toBe('failed');
    expect(taskOutcome('stopped', 'completed')).toBe('succeeded');
    expect(taskOutcome('failed', null)).toBe('failed');
    expect(taskOutcome('stopped', null)).toBe('cancelled');
  });

  it('agent：connecting 视作排队，done/budget_exceeded 各有终态语义', () => {
    expect(toOutcome('agent', 'connecting')).toBe('queued');
    expect(toOutcome('agent', 'running')).toBe('running');
    expect(toOutcome('agent', 'done')).toBe('succeeded');
    expect(toOutcome('agent', 'failed')).toBe('failed');
    expect(toOutcome('agent', 'cancelled')).toBe('cancelled');
    expect(toOutcome('agent', 'budget_exceeded')).toBe('budget_exceeded');
  });

  it('flow：waiting_human / interrupted 保持独立语义', () => {
    expect(toOutcome('flow', 'queued')).toBe('queued');
    expect(toOutcome('flow', 'connecting')).toBe('queued');
    expect(toOutcome('flow', 'running')).toBe('running');
    expect(toOutcome('flow', 'waiting_human')).toBe('waiting');
    expect(toOutcome('flow', 'succeeded')).toBe('succeeded');
    expect(toOutcome('flow', 'failed')).toBe('failed');
    expect(toOutcome('flow', 'cancelled')).toBe('cancelled');
    expect(toOutcome('flow', 'interrupted')).toBe('interrupted');
  });

  it('失败/进行中的判定与展示口径一致', () => {
    expect(isFailureOutcome('budget_exceeded')).toBe(true);
    expect(isFailureOutcome('interrupted')).toBe(true);
    expect(isFailureOutcome('cancelled')).toBe(false);
    expect(isLiveOutcome('waiting')).toBe(true);
    expect(isLiveOutcome('succeeded')).toBe(false);
  });
});

describe('classifyFailure：原始错误 → 人话归因', () => {
  it('确定性信号优先：取消 / 中断 / stopReason / 预算', () => {
    expect(classifyFailure({ outcome: 'cancelled', rawError: 'ECONNREFUSED' })).toBe('cancelled');
    expect(classifyFailure({ outcome: 'interrupted' })).toBe('interrupted');
    expect(classifyFailure({ outcome: 'failed', stopReason: 'max_steps' })).toBe('max_steps');
    expect(classifyFailure({ outcome: 'failed', stopReason: 'max_failures' })).toBe('max_failures');
    expect(classifyFailure({ outcome: 'failed', stopReason: 'breaker' })).toBe('breaker');
    expect(classifyFailure({ outcome: 'budget_exceeded', rawError: 'anything' })).toBe(
      'budget_exceeded',
    );
  });

  it('文本启发式：权限 / 鉴权 / 限流 / 超时 / 网络 / 模型 / 工具 / 节点', () => {
    expect(classifyFailure({ outcome: 'failed', rawError: 'AGENT_REJECTED' })).toBe('rejected');
    expect(classifyFailure({ outcome: 'failed', rawError: '审查驳回，需调整目标' })).toBe('rejected');
    expect(classifyFailure({ outcome: 'failed', rawError: '工具调用被拒绝：无权限' })).toBe(
      'permission',
    );
    expect(classifyFailure({ outcome: 'failed', rawError: '401 unauthorized: invalid api key' })).toBe(
      'auth',
    );
    expect(classifyFailure({ outcome: 'failed', rawError: '429 Too Many Requests（额度不足）' })).toBe(
      'rate_limit',
    );
    expect(classifyFailure({ outcome: 'failed', rawError: 'request timed out after 60s' })).toBe(
      'timeout',
    );
    expect(classifyFailure({ outcome: 'failed', rawError: 'fetch failed: ECONNREFUSED' })).toBe(
      'network',
    );
    expect(classifyFailure({ outcome: 'failed', rawError: 'provider 返回模型不存在' })).toBe('model');
    expect(classifyFailure({ outcome: 'failed', rawError: 'tool execution error' })).toBe('tool');
    expect(classifyFailure({ outcome: 'failed', rawError: '节点 node-3 执行失败' })).toBe('node');
  });

  it('无信号 / 空文本 → unknown，不裸露内部错误码', () => {
    expect(classifyFailure({ outcome: 'failed' })).toBe('unknown');
    expect(classifyFailure({ outcome: 'failed', rawError: 'AGENT_RUN_FAILED' })).toBe('unknown');
  });

  it('code 与 message 合并判断', () => {
    expect(
      classifyFailure({ outcome: 'failed', code: 'AGENT_BUDGET_EXCEEDED', rawError: '超限' }),
    ).toBe('budget_exceeded');
    expect(classifyFailure({ outcome: 'failed', code: 'flow/run-failed', rawError: '工具执行失败' })).toBe(
      'tool',
    );
  });
});

describe('耗时口径', () => {
  it('毫秒计算：缺失/非法/倒挂返回 null', () => {
    expect(runDurationMs('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:02.500Z')).toBe(2500);
    expect(runDurationMs(null, '2026-01-01T00:00:00.000Z')).toBeNull();
    expect(runDurationMs('2026-01-01T00:00:00.000Z', null)).toBeNull();
    expect(runDurationMs('not-a-date', '2026-01-01T00:00:00.000Z')).toBeNull();
    expect(runDurationMs('2026-01-01T00:00:05.000Z', '2026-01-01T00:00:01.000Z')).toBeNull();
  });

  it('runElapsedMs：未结束用当前时间，结束用 finishedAt', () => {
    const now = Date.parse('2026-01-01T00:00:10.000Z');
    expect(runElapsedMs('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:04.000Z', now)).toBe(4000);
    expect(runElapsedMs('2026-01-01T00:00:00.000Z', null, now)).toBe(10_000);
    expect(runElapsedMs(null, null, now)).toBeNull();
  });

  it('展示格式：ms / 秒 / 分钟，非法值返回 null', () => {
    expect(formatDurationMs(850)).toBe('850ms');
    expect(formatDurationMs(1400)).toBe('1.4s');
    expect(formatDurationMs(12_300)).toBe('12s');
    expect(formatDurationMs(65_000)).toBe('1m 05s');
    expect(formatDurationMs(59_999)).toBe('1m 00s');
    expect(formatDurationMs(null)).toBeNull();
    expect(formatDurationMs(-1)).toBeNull();
  });
});
