import type { DatabaseInstance } from '@wbfm/database';
import type { SecretCipher } from '../secrets/cipher';
import type { McpRegistry } from '../mcp/registry';
import type { SkillService } from '../skills/skill-service';
import type { PermissionService } from './permission-service';
import type { PendingConfirmations } from './pending-confirmations';
import type { TaskGrantRegistry } from './task-grants';
import type { ToolBreaker } from '../tools/tool-breaker';
import type { Tool } from '../tools/types';

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
  /** v0.6 M4：工具熔断器（未提供时不做连续失败降级） */
  breakers?: ToolBreaker;
  /** v0.7 M2：任务级批量授权（remember='task'，仅内存） */
  taskGrants?: TaskGrantRegistry;
  /**
   * v0.8 M1：flow 工具第三来源解析器（已发布工作流 → Tool）。
   * 懒解析：仅在 resolveTool 遇到 flow:<id> 时调用，避免与 FlowRunService 的构造环。
   */
  flowToolResolver?: (workflowId: string) => Tool | null;
}
