import type { DatabaseInstance } from '@wbfm/database';
import type { SecretCipher } from '../secrets/cipher';
import type { McpRegistry } from '../mcp/registry';
import type { SkillService } from '../skills/skill-service';
import type { PermissionService } from './permission-service';
import type { PendingConfirmations } from './pending-confirmations';

/** 所有服务共享的依赖：数据库实例与密钥器 */
export interface ServiceDeps {
  db: DatabaseInstance;
  cipher: SecretCipher;
  /** v0.6：MCP 注册表（未提供时 enabledTools 中的 MCP 限定名静默跳过） */
  mcp?: McpRegistry;
  /** v0.6 M2：工具权限服务（HITL 授权记忆） */
  permissions?: PermissionService;
  /** v0.6 M2：HITL 挂起确认注册表（未提供时未授权工具直接拒绝） */
  confirmations?: PendingConfirmations;
  /** v0.6 M3：技能服务（未提供时对话不注入技能模板与预绑定工具） */
  skills?: SkillService;
}
