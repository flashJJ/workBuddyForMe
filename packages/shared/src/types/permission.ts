/** v0.6 M2：工具权限分级（Human-in-the-Loop 人工确认） */

export type PermissionLevel = 'read' | 'write' | 'danger';

export type PermissionAction = 'allow' | 'deny';

/** 一条授权记录（按工具×维度记忆） */
export interface ToolPermission {
  id: string;
  toolName: string;
  /** 'all'=全局授权，'assistant:<id>'=按助手授权 */
  scope: string;
  action: PermissionAction;
  grantedAt: string;
}
