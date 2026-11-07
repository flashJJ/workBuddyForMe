/**
 * MCP 相关领域类型（v1.2 从 domain.ts 拆出，公开面不变，仍由 @wbfm/shared/types 聚合 re-export）。
 */
import type { McpServerStatus, McpTransport } from '../constants/index';
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

/** v2.24：安装 MCP 服务器前的本机运行环境探测结果 */
export interface McpRuntimeProbe {
  available: boolean;
  version: string | null;
  /** 主版本号（Node 版本比较用；其他工具可能为 null） */
  major: number | null;
  path: string | null;
}

export interface McpRuntimeStatus {
  platform: string;
  node: McpRuntimeProbe;
  npx: McpRuntimeProbe;
  uvx: McpRuntimeProbe;
  chrome: McpRuntimeProbe;
  /** 探测时间（ISO），前端用于展示新鲜度 */
  checkedAt: string;
}

/** v2.24：远程 MCP 的 OAuth 授权状态（不暴露令牌） */
export interface McpOAuthStatus {
  authorized: boolean;
  expired: boolean;
  /** 有刷新令牌，过期后可在下次连接时自动续期 */
  refreshable: boolean;
  expiresAt: string | null;
  scope: string | null;
  /** 授权账号/工作区标识（Notion 等令牌响应提供时展示） */
  accountLabel: string | null;
}

export type McpOAuthStatuses = Record<string, McpOAuthStatus>;

export interface McpOAuthStartResult {
  authorizationUrl: string;
}
