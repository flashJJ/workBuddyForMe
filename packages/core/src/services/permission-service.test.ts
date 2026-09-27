import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../secrets/cipher';
import { createPermissionService } from './permission-service';
import type { ServiceDeps } from './deps';

describe('权限服务（v0.6 M2 HITL）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-perm-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  function makeService(): ServiceDeps {
    return { db, cipher: createWebCipher() };
  }

  it('read 工具默认放行，无需授权记录', () => {
    const service = createPermissionService(makeService());
    expect(service.isAllowed('current_time', 'read', 'assistant:1')).toBe(true);
    expect(service.isAllowed('knowledge_search', 'read', 'assistant:1')).toBe(true);
    expect(service.isAllowed('fetch_webpage', 'read', 'assistant:1')).toBe(true);
  });

  it('write/danger 工具无授权时拒绝', () => {
    const service = createPermissionService(makeService());
    expect(service.isAllowed('fetch_webpage', 'danger', 'assistant:1')).toBe(false);
    expect(service.isAllowed('mcp:fs:write_file', 'write', 'assistant:1')).toBe(false);
  });

  it('授权后放行；deny 记录覆盖 allow', () => {
    const service = createPermissionService(makeService());
    service.grantPermission('fetch_webpage', 'assistant:1', 'allow');
    expect(service.isAllowed('fetch_webpage', 'danger', 'assistant:1')).toBe(true);

    service.grantPermission('fetch_webpage', 'assistant:1', 'deny');
    expect(service.isAllowed('fetch_webpage', 'danger', 'assistant:1')).toBe(false);
  });

  it('全局授权（all）优先于助手级授权', () => {
    const service = createPermissionService(makeService());
    service.grantPermission('fetch_webpage', 'all', 'deny');
    expect(service.isAllowed('fetch_webpage', 'danger', 'assistant:1')).toBe(false);
    expect(service.isAllowed('fetch_webpage', 'danger', 'assistant:2')).toBe(false);

    // 助手级 allow 不能覆盖全局 deny
    service.grantPermission('fetch_webpage', 'assistant:1', 'allow');
    expect(service.isAllowed('fetch_webpage', 'danger', 'assistant:1')).toBe(false);
  });

  it('撤销授权后恢复拒绝状态', () => {
    const service = createPermissionService(makeService());
    const perm = service.grantPermission('mcp:fs:write_file', 'assistant:1', 'allow');
    expect(service.isAllowed('mcp:fs:write_file', 'write', 'assistant:1')).toBe(true);

    service.revokePermission(perm.id);
    expect(service.isAllowed('mcp:fs:write_file', 'write', 'assistant:1')).toBe(false);
  });

  it('撤销不存在记录抛 notFound', () => {
    const service = createPermissionService(makeService());
    expect(() => service.revokePermission('no-such-id')).toThrow();
  });

  it('listPermissions 按工具过滤', () => {
    const service = createPermissionService(makeService());
    service.grantPermission('fetch_webpage', 'assistant:1', 'allow');
    service.grantPermission('mcp:fs:write_file', 'assistant:2', 'deny');

    const all = service.listPermissions();
    expect(all).toHaveLength(2);

    const filtered = service.listPermissions('fetch_webpage');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.toolName).toBe('fetch_webpage');
  });
});
