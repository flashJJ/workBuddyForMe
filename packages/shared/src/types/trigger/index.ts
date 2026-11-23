import type { FlowTrigger, FlowWebhookAuthMode } from '../flow';

/** @子域 barrel types/trigger：v4.25 事件触发（Webhook / 文件监听）领域类型 */

export const FLOW_TRIGGER_KINDS = ['webhook', 'file'] as const;
export type FlowTriggerKind = (typeof FLOW_TRIGGER_KINDS)[number];

export const FLOW_TRIGGER_LAST_STATUSES = [
  'created',
  'skipped_busy',
  'error',
  'disabled',
] as const;
export type FlowTriggerLastStatus = (typeof FLOW_TRIGGER_LAST_STATUSES)[number];

export interface FlowFileTriggerConfig {
  /** 绝对目录路径 */
  path: string;
  /** 小写、无点 */
  extensions: string[];
  /** 缺省 true */
  recursive?: boolean;
}

export interface FlowTriggerView {
  id: string;
  workflowId: string;
  kind: FlowTriggerKind;
  name: string;
  enabled: boolean;
  /** Webhook 触发器为 null */
  config: FlowFileTriggerConfig | null;
  /** Webhook 展示路径；Secret 本身永不返回 */
  webhookPath: string | null;
  /** v5.0：Webhook 鉴权方式；文件触发器为 null */
  authMode: FlowWebhookAuthMode | null;
  /** v5.0：是否已保存 HMAC 密钥密文（旧触发器需先轮换） */
  hasSigningSecret: boolean;
  lastFiredAt: string | null;
  lastRunId: string | null;
  lastStatus: FlowTriggerLastStatus | null;
  createdAt: string;
  updatedAt: string;
}

/** 无人值守触发：写/危险工具默认拒绝 */
export const UNATTENDED_FLOW_TRIGGERS = ['api', 'mcp', 'schedule', 'webhook', 'file'] as const;
export function isUnattendedFlowTrigger(trigger: FlowTrigger): boolean {
  return (UNATTENDED_FLOW_TRIGGERS as readonly string[]).includes(trigger);
}
