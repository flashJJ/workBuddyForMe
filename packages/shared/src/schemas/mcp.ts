import { z } from 'zod';
import { MCP_SERVER_NAME_MAX, MCP_SERVER_NAME_PATTERN } from '../constants';

/**
 * v0.6 MCP 服务器 API 契约。
 * stdio 字段本期实现；http 字段为 M2 Streamable HTTP 预留（schema 先行，
 * 避免后续对 mcp_servers 表/API 再做破坏性调整）。
 */

/** 服务器名 = 命名空间，必须标识符安全（参与模型侧 function 名） */
const serverNameSchema = z
  .string()
  .trim()
  .min(1, '名称不能为空')
  .max(MCP_SERVER_NAME_MAX, `名称最长 ${MCP_SERVER_NAME_MAX} 字符`)
  .regex(MCP_SERVER_NAME_PATTERN, '仅允许字母/数字/下划线/中划线，且以字母或数字开头');

/** stdio 环境变量键（限制注入面，M2 权限分级沿用） */
const envKeySchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, '环境变量名需为合法标识符')
  .max(64);
const envVarsSchema = z.record(envKeySchema, z.string().max(2000)).default({});
const headerVarsSchema = z.record(z.string().trim().min(1).max(128), z.string().max(2000)).default({});

const enabledSchema = z.boolean().optional();

const stdioServerSchema = z.object({
  transport: z.literal('stdio'),
  name: serverNameSchema,
  command: z.string().trim().min(1, 'stdio 服务器必须提供启动命令').max(500),
  args: z.array(z.string().min(1).max(2000)).max(50, '启动参数最多 50 个').default([]),
  env: envVarsSchema,
  enabled: enabledSchema,
});

const httpServerSchema = z.object({
  transport: z.literal('http'),
  name: serverNameSchema,
  url: z
    .string()
    .trim()
    .url('url 必须是合法 URL')
    .refine((v) => v.startsWith('http://') || v.startsWith('https://'), '仅支持 http/https 协议'),
  headers: headerVarsSchema,
  enabled: enabledSchema,
});

export const mcpServerCreateSchema = z.discriminatedUnion('transport', [
  stdioServerSchema,
  httpServerSchema,
]);
export type McpServerCreateInput = z.infer<typeof mcpServerCreateSchema>;

/** 更新按 transport 分支做部分更新（transport 必带，前端编辑时已知） */
export const mcpServerUpdateSchema = z
  .discriminatedUnion('transport', [
    stdioServerSchema.partial().extend({ transport: z.literal('stdio') }),
    httpServerSchema.partial().extend({ transport: z.literal('http') }),
  ])
  .refine((v) => Object.keys(v).length > 1, '至少提供一个更新字段');
export type McpServerUpdateInput = z.infer<typeof mcpServerUpdateSchema>;

// ── 命名空间工具函数（core 注册/解析与 web 展示共用） ──

export const MCP_TOOL_NAMESPACE = 'mcp';

/** 构建模型侧 function 名：mcp:<server>:<tool> */
export function buildMcpToolName(serverName: string, toolName: string): string {
  return `${MCP_TOOL_NAMESPACE}:${serverName}:${toolName}`;
}

export function isMcpToolName(name: string): boolean {
  return name.startsWith(`${MCP_TOOL_NAMESPACE}:`);
}

/** 解析限定名；非 MCP 名或格式非法返回 null */
export function parseMcpToolName(name: string): { serverName: string; toolName: string } | null {
  const parts = name.split(':');
  if (parts.length !== 3 || parts[0] !== MCP_TOOL_NAMESPACE) return null;
  const [, serverName, toolName] = parts;
  if (!serverName || !toolName) return null;
  return { serverName, toolName };
}
