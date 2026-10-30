import type { AgentPolicy } from '@wbfm/shared/schemas';
import type { Tool } from '../tools/types';

/**
 * v2.13 M4：任务运行时的策略限额（时长 / 写入 / 外部调用）。
 * 只在内存累计本次运行；步数上限仍由 task_runs.max_steps 负责。
 */

export type RuntimeLimitReason = 'max_runtime' | 'max_writes' | 'max_external_calls';

export interface RuntimeLimitCheck {
  allowed: boolean;
  reason?: RuntimeLimitReason;
}

export interface RuntimeLimits {
  /** 是否已超过运行时长上限 */
  expired(): boolean;
  /** 执行工具前检查并累计写入 / 外部调用次数 */
  checkTool(tool: Tool, source: string): RuntimeLimitCheck;
}

export function isExternalTool(tool: Tool, source: string): boolean {
  return source === 'mcp' || tool.name === 'fetch_webpage';
}

export function createRuntimeLimits(input: {
  policy: AgentPolicy;
  startedAtMs: number;
  now?: () => number;
}): RuntimeLimits {
  const now = input.now ?? Date.now;
  const limits = input.policy.limits;
  let writes = 0;
  let externalCalls = 0;

  return {
    expired() {
      return now() - input.startedAtMs >= limits.maxRuntimeMs;
    },

    checkTool(tool, source) {
      if (tool.permission === 'write') {
        if (writes >= limits.maxWritesPerRun) return { allowed: false, reason: 'max_writes' };
        writes += 1;
      }
      if (isExternalTool(tool, source)) {
        if (externalCalls >= limits.maxExternalCallsPerRun) {
          return { allowed: false, reason: 'max_external_calls' };
        }
        externalCalls += 1;
      }
      return { allowed: true };
    },
  };
}
