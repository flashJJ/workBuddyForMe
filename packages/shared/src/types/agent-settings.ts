import type { AgentPolicy } from '../schemas/agent-policy';

/**
 * v2.13 M2：Agent 治理策略设置字段（单独成文件，避免 domain.ts 超行）。
 * 默认值见 core settings-service；读取时由 resolveAgentPolicy 钳制。
 */
export interface AgentGovernanceSettingsFields {
  agentPolicy?: AgentPolicy;
}
