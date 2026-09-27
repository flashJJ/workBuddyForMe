import type { Database } from 'better-sqlite3';
import { newId, nowIso } from './mappers';

export interface ToolPermissionRow {
  id: string;
  tool_name: string;
  scope: string;
  action: 'allow' | 'deny';
  granted_at: string;
  created_at: string;
  updated_at: string;
}

export interface ToolPermissionCreateFields {
  toolName: string;
  scope: string;
  action: 'allow' | 'deny';
}

export interface ToolPermissionRepository {
  list(toolName?: string): ToolPermissionRow[];
  getByToolAndScope(toolName: string, scope: string): ToolPermissionRow | null;
  create(fields: ToolPermissionCreateFields): ToolPermissionRow;
  update(id: string, fields: Partial<ToolPermissionCreateFields>): ToolPermissionRow | null;
  remove(id: string): boolean;
  removeByToolAndScope(toolName: string, scope: string): boolean;
}

export function createToolPermissionRepository(db: Database): ToolPermissionRepository {
  const toRow = (row: ToolPermissionRow): ToolPermissionRow => ({
    ...row,
    created_at: row.created_at ?? nowIso(),
    updated_at: row.updated_at ?? nowIso(),
  });

  return {
    list(toolName) {
      if (toolName) {
        return db
          .prepare('SELECT * FROM tool_permissions WHERE tool_name = ? ORDER BY created_at DESC')
          .all(toolName)
          .map((row) => toRow(row as ToolPermissionRow));
      }
      return db
        .prepare('SELECT * FROM tool_permissions ORDER BY created_at DESC')
        .all()
        .map((row) => toRow(row as ToolPermissionRow));
    },

    getByToolAndScope(toolName, scope) {
      const row = db
        .prepare('SELECT * FROM tool_permissions WHERE tool_name = ? AND scope = ?')
        .get(toolName, scope) as ToolPermissionRow | undefined;
      return row ? toRow(row) : null;
    },

    create(fields) {
      const id = newId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO tool_permissions (id, tool_name, scope, action, granted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, fields.toolName, fields.scope, fields.action, now, now, now);
      const row = db.prepare('SELECT * FROM tool_permissions WHERE id = ?').get(id) as ToolPermissionRow;
      return toRow(row);
    },

    update(id, fields) {
      const existing = db.prepare('SELECT * FROM tool_permissions WHERE id = ?').get(id) as ToolPermissionRow | undefined;
      if (!existing) return null;
      const updated = {
        ...existing,
        ...fields,
        updated_at: nowIso(),
      };
      db.prepare(
        `UPDATE tool_permissions SET tool_name = ?, scope = ?, action = ?, updated_at = ? WHERE id = ?`,
      ).run(updated.tool_name, updated.scope, updated.action, updated.updated_at, id);
      const row = db.prepare('SELECT * FROM tool_permissions WHERE id = ?').get(id) as ToolPermissionRow;
      return toRow(row);
    },

    remove(id) {
      return db.prepare('DELETE FROM tool_permissions WHERE id = ?').run(id).changes > 0;
    },

    removeByToolAndScope(toolName, scope) {
      return db
        .prepare('DELETE FROM tool_permissions WHERE tool_name = ? AND scope = ?')
        .run(toolName, scope).changes > 0;
    },
  };
}
