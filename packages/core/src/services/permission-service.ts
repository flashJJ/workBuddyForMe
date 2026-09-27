import type { ToolPermission, PermissionLevel, PermissionAction } from '@wbfm/shared';
import { ApiError } from '@wbfm/shared';
import { createToolPermissionRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';

/**
 * 权限服务：按工具×维度管理授权记录。
 * - read 工具默认放行，无权限检查；
 * - write/danger 工具需检查授权记录或触发 HITL；
 * - 授权记忆按 scope 区分（'all'=全局，'assistant:<id>'=按助手）。
 */
export interface PermissionService {
  /** 查询指定工具与维度的授权记录 */
  getPermission(toolName: string, scope: string): ToolPermission | null;
  /** 列出全部授权记录（设置页管理） */
  listPermissions(toolName?: string): ToolPermission[];
  /** 创建授权记录（HITL 确认后调用） */
  grantPermission(toolName: string, scope: string, action: PermissionAction): ToolPermission;
  /** 撤销授权记录 */
  revokePermission(id: string): void;
  /** 检查工具在当前上下文中是否已授权（read 返回 true；write/danger 需有 allow 记录） */
  isAllowed(toolName: string, permission: PermissionLevel, scope: string): boolean;
}

export function createPermissionService(deps: ServiceDeps): PermissionService {
  const repo = createToolPermissionRepository(deps.db);

  return {
    getPermission(toolName, scope) {
      const row = repo.getByToolAndScope(toolName, scope);
      if (!row) return null;
      return {
        id: row.id,
        toolName: row.tool_name,
        scope: row.scope,
        action: row.action as PermissionAction,
        grantedAt: row.granted_at,
      };
    },

    listPermissions(toolName) {
      const rows = toolName ? repo.list(toolName) : repo.list();
      return rows.map((row) => ({
        id: row.id,
        toolName: row.tool_name,
        scope: row.scope,
        action: row.action as PermissionAction,
        grantedAt: row.granted_at,
      }));
    },

    grantPermission(toolName, scope, action) {
      const existing = repo.getByToolAndScope(toolName, scope);
      if (existing) {
        // 已存在记录：更新 action（覆盖 allow/deny）
        const updated = repo.update(existing.id, { action });
        if (!updated) throw ApiError.notFound('权限记录', existing.id);
        return {
          id: updated.id,
          toolName: updated.tool_name,
          scope: updated.scope,
          action: updated.action as PermissionAction,
          grantedAt: updated.granted_at,
        };
      }
      const created = repo.create({ toolName, scope, action });
      return {
        id: created.id,
        toolName: created.tool_name,
        scope: created.scope,
        action: created.action as PermissionAction,
        grantedAt: created.granted_at,
      };
    },

    revokePermission(id) {
      const removed = repo.remove(id);
      if (!removed) {
        throw ApiError.notFound('权限记录', id);
      }
    },

    isAllowed(toolName, permission, scope) {
      if (permission === 'read') return true;
      // write/danger：检查授权记录（scope 优先精确匹配，'all' 为全局）
      const globalRecord = repo.getByToolAndScope(toolName, 'all');
      if (globalRecord) return globalRecord.action === 'allow';
      const scopedRecord = repo.getByToolAndScope(toolName, scope);
      return scopedRecord?.action === 'allow';
    },
  };
}
