import {
  AGENT_BUDGET_BOUNDS,
  type AgentBudget,
  type FlowAgentConfig,
} from '@wbfm/shared/schemas';

/**
 * v1.4 agent 节点（Flow）：配置规整纯函数。
 * 节点执行由引擎内联编排（runAgentNode，需把协作帧桥接为 flow 事件），
 * 与 human/tool 节点一样不注册到普通 handler 表；此处只放配置层共享逻辑。
 */

/** 桌面工具域标识（出现即意味着 executor 需要屏幕观察模式） */
export const AGENT_DESKTOP_SCOPE = 'desktop';

/** 从已解析配置读取工具域（去空白/去重保序） */
export function readAgentToolScopes(config: Record<string, unknown>): string[] {
  const raw = config.toolScopes;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const scopes: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const scope = item.trim();
    if (!scope || seen.has(scope)) continue;
    seen.add(scope);
    scopes.push(scope);
  }
  return scopes;
}

/** 预算覆盖（仅取落在硬区间内的字段；未配置回落协作默认，由仓储 DDL/runner 兜底） */
export function readAgentBudget(config: Record<string, unknown>): Partial<AgentBudget> {
  const budget: Partial<AgentBudget> = {};
  const pick = (key: keyof AgentBudget, bound: { min: number; max: number }): void => {
    const value = config[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= bound.min && value <= bound.max) {
      budget[key] = value;
    }
  };
  pick('maxRounds', AGENT_BUDGET_BOUNDS.maxRounds);
  pick('maxSteps', AGENT_BUDGET_BOUNDS.maxSteps);
  pick('maxTotalTokens', AGENT_BUDGET_BOUNDS.maxTotalTokens);
  return budget;
}

/** 读取三角色模型覆盖（空串/非字符串归一为 null=回落） */
export function readAgentRoleModelIds(config: Record<string, unknown>): {
  planner: string | null;
  executor: string | null;
  reviewer: string | null;
} {
  const strOrNull = (key: string): string | null => {
    const v = config[key];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  return {
    planner: strOrNull('plannerModelId'),
    executor: strOrNull('executorModelId'),
    reviewer: strOrNull('reviewerModelId'),
  };
}

export type { FlowAgentConfig };
