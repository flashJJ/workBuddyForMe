import type { DatabaseInstance } from '../client';
import type { McpServerConfig, McpTransport } from '@wbfm/shared';
import { newId, nowIso, mapMcpServer, type McpServerRow } from './mappers';

export interface McpServerCreateFields {
  /** 不传则自动生成 UUID */
  id?: string;
  transport: McpTransport;
  name: string;
  /** stdio：启动命令；http 行留空串 */
  command?: string;
  /** stdio：启动参数 */
  args?: string[];
  /** stdio：环境变量白名单 */
  env?: Record<string, string>;
  /** http（M2）：端点 URL */
  url?: string;
  /** http（M2）：附加请求头 */
  headers?: Record<string, string>;
  enabled?: boolean;
}

export type McpServerUpdateFields = Partial<Omit<McpServerCreateFields, 'id'>>;

/** JSON 列与布尔列的写入归一 */
function toRowValues(fields: Partial<McpServerCreateFields>): Record<string, unknown> {
  const values: Record<string, unknown> = { ...fields };
  if (fields.args !== undefined) values.args = JSON.stringify(fields.args);
  if (fields.env !== undefined) values.env = JSON.stringify(fields.env);
  if (fields.headers !== undefined) values.headers = JSON.stringify(fields.headers);
  if (fields.enabled !== undefined) values.enabled = fields.enabled ? 1 : 0;
  return values;
}

const COLUMN_MAP: Record<keyof McpServerUpdateFields, string> = {
  transport: 'transport',
  name: 'name',
  command: 'command',
  args: 'args',
  env: 'env',
  url: 'url',
  headers: 'headers',
  enabled: 'enabled',
};

export function createMcpServerRepository(db: DatabaseInstance) {
  return {
    create(fields: McpServerCreateFields): McpServerConfig {
      const id = fields.id ?? newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO mcp_servers
           (id, transport, name, command, args, env, url, headers, enabled, created_at, updated_at)
         VALUES
           (@id, @transport, @name, @command, @args, @env, @url, @headers, @enabled, @ts, @ts)`,
      ).run({
        id,
        transport: fields.transport,
        name: fields.name,
        command: fields.command ?? '',
        args: JSON.stringify(fields.args ?? []),
        env: JSON.stringify(fields.env ?? {}),
        url: fields.url ?? '',
        headers: JSON.stringify(fields.headers ?? {}),
        enabled: (fields.enabled ?? true) ? 1 : 0,
        ts,
      });
      return mapMcpServer(this.getRow(id)!);
    },

    list(): McpServerConfig[] {
      const rows = db
        .prepare(`SELECT * FROM mcp_servers ORDER BY created_at ASC, name ASC`)
        .all() as McpServerRow[];
      return rows.map(mapMcpServer);
    },

    get(id: string): McpServerConfig | null {
      const row = this.getRow(id);
      return row ? mapMcpServer(row) : null;
    },

    getByName(name: string): McpServerConfig | null {
      const row = db.prepare(`SELECT * FROM mcp_servers WHERE name = ?`).get(name) as
        | McpServerRow
        | undefined;
      return row ? mapMcpServer(row) : null;
    },

    getRow(id: string): McpServerRow | null {
      return (
        (db.prepare(`SELECT * FROM mcp_servers WHERE id = ?`).get(id) as McpServerRow | undefined) ??
        null
      );
    },

    update(id: string, fields: McpServerUpdateFields): McpServerConfig | null {
      const keys = Object.keys(fields) as (keyof McpServerUpdateFields)[];
      if (keys.length === 0) return this.get(id);
      const sets = keys.map((key) => `${COLUMN_MAP[key]} = @${key}`).join(', ');
      const values = { ...toRowValues(fields), updated_at: nowIso() };
      const result = db
        .prepare(`UPDATE mcp_servers SET ${sets}, updated_at = @updated_at WHERE id = @id`)
        .run({ ...values, id });
      if (result.changes === 0) return null;
      return this.get(id);
    },

    /** 删除配置；返回是否实际删除（不存在时 false） */
    remove(id: string): boolean {
      const result = db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).run(id);
      return result.changes > 0;
    },
  };
}

export type McpServerRepository = ReturnType<typeof createMcpServerRepository>;
