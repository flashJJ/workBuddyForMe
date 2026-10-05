import type { FlowNodeHandler } from '../types';
import {
  evaluateCondition,
  type ConditionMatch,
  type ConditionOp,
  type ConditionRule,
} from './condition-eval';

/**
 * condition 节点：声明式规则求值，输出 { result }。
 * 引擎据此激活 true/false 分支边（分支剪枝），保证流程确定性、不依赖模型。
 */
export type ConditionNodeConfig = {
  rules: ConditionRule[];
  match?: ConditionMatch;
};

export interface ConditionNodeOutputs {
  result: boolean;
}

export const conditionNodeHandler: FlowNodeHandler<ConditionNodeConfig, ConditionNodeOutputs> = {
  type: 'condition',
  async run(config) {
    const rules = Array.isArray(config.rules)
      ? (config.rules.filter((r) => r && typeof r.op === 'string') as ConditionRule[])
      : [];
    return { result: evaluateCondition(rules, config.match ?? 'all') };
  },
};

export type { ConditionOp, ConditionRule, ConditionMatch };
