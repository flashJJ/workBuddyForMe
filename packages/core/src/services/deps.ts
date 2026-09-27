import type { DatabaseInstance } from '@wbfm/database';
import type { SecretCipher } from '../secrets/cipher';
import type { McpRegistry } from '../mcp/registry';

/** 所有服务共享的依赖：数据库实例与密钥器 */
export interface ServiceDeps {
  db: DatabaseInstance;
  cipher: SecretCipher;
  /** v0.6：MCP 注册表（未提供时 enabledTools 中的 MCP 限定名静默跳过） */
  mcp?: McpRegistry;
}
