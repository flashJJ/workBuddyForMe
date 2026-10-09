/**
 * MCP 相关领域类型（v1.2 从 domain.ts 拆出，公开面不变，仍由 @wbfm/shared/types 聚合 re-export）。
 */
import type { McpServerStatus, McpTransport } from '../constants';
import type { Timestamped } from './domain';

/** v0.6 MCP 服务器配置（mcp_servers 表行；stdio/http 字段按 transport 取用） */
export interface McpServerConfig extends Timestamped {
  id: string;
  transport: McpTransport;
  /** 标识符安全的命名空间名（唯一），工具限定名用它构建 */
  name: string;
  /** stdio：启动命令 */
  command: string;
  /** stdio：启动参数 */
  args: string[];
  /** stdio：环境变量白名单（叠加在继承环境之上） */
  env: Record<string, string>;
  /** http（M2）：Streamable HTTP 端点 */
  url: string;
  /** http（M2）：附加请求头 */
  headers: Record<string, string>;
  enabled: boolean;
}

/** 设置页/助手表单看到的服务器视图 = 配置 + 连接状态 */
export interface McpServerInfo extends McpServerConfig {
  status: McpServerStatus;
  /** 最近一次错误原因或握手摘要；正常连接时为 null */
  statusDetail: string | null;
  /** 已发现的工具数（仅 connected 时有意义） */
  toolCount: number;
}

/** MCP 服务器发现的工具（注册进工具运行时前的元数据） */
export interface McpToolInfo {
  serverName: string;
  /** 服务器内的原始工具名 */
  name: string;
  /** 全局限定名 mcp:<server>:<tool>，模型侧 function 名 */
  qualifiedName: string;
  description: string;
  /** MCP inputSchema（JSON Schema），透传为 function parameters */
  inputSchema: Record<string, unknown>;
}
