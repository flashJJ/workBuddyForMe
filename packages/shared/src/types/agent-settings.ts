import type { AgentPolicy } from '../schemas/agent/agent-policy';

/**
 * v2.13 M2：Agent 治理策略设置字段（单独成文件，避免 domain.ts 超行）。
 * 默认值见 core settings-service；读取时由 resolveAgentPolicy 钳制。
 */
export interface AgentGovernanceSettingsFields {
  agentPolicy?: AgentPolicy;
  /** v4.7 P1：复杂任务执行前计划确认（缺省 true；关闭后直接执行） */
  agentPlanReviewEnabled?: boolean;
}
