import type { McpServerConfig, McpTransport } from '@wbfm/shared';

/** v0.6 MCP 服务器行：args/env/headers 为 JSON 文本，读取容错 */
export interface McpServerRow {
  id: string;
  transport: McpTransport;
  name: string;
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, string> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function mapMcpServer(row: McpServerRow): McpServerConfig {
  return {
    id: row.id,
    transport: row.transport,
    name: row.name,
    command: row.command,
    args: parseJsonArray<string>(row.args),
    env: parseJsonObject(row.env),
    url: row.url,
    headers: parseJsonObject(row.headers),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
