/**
 * v2.32 M4：存储占用与孤儿附件回收接口冒烟。
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import {
  ensureDataDirs,
  getDataDir,
  resetDataRootForTest,
  setDataRootForTest,
} from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as usageRoute } from './usage/route';
import { POST as scanRoute } from './orphans/scan/route';
import { POST as trashRoute } from './orphans/trash/route';
import { GET as trashListRoute } from './trash/route';
import { POST as restoreRoute } from './trash/restore/route';
import { POST as purgeRoute } from './trash/purge/route';

function post(path: string, body: unknown): Request {
  return new Request(`http://x${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/storage（v2.32 M4）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-storage-api-'));
    setDataRootForTest(tempRoot);
    ensureDataDirs();
    db = createDatabase(':memory:');
    __setContainerForTest(__buildContainerForTest(db, createWebCipher()));
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('占用统计返回分项；孤儿扫描 → 回收 → 恢复闭环', async () => {
    writeFileSync(join(getDataDir('attachments'), 'orphan.bin'), Buffer.alloc(16));

    const usageRes = await usageRoute(new Request('http://x/api/storage/usage'));
    const usage = (await usageRes.json()) as {
      data: { totalBytes: number; items: Record<string, number> };
    };
    expect(usage.data.items.attachments).toBeGreaterThanOrEqual(16);

    const scanRes = await scanRoute(post('/api/storage/orphans/scan', {}));
    const scan = (await scanRes.json()) as {
      data: { files: Array<{ name: string }>; unreferenced: Array<{ name: string }> };
    };
    expect(scan.data.files).toEqual([{ name: 'orphan.bin', bytes: 16 }]);
    expect(scan.data.unreferenced).toEqual([]);

    const trashRes = await trashRoute(
      post('/api/storage/orphans/trash', { names: ['orphan.bin'] }),
    );
    const trashed = (await trashRes.json()) as { data: { moved: number; date: string } };
    expect(trashed.data.moved).toBe(1);
    expect(existsSync(join(getDataDir('attachments'), 'orphan.bin'))).toBe(false);

    const listRes = await trashListRoute(new Request('http://x/api/storage/trash'));
    const list = (await listRes.json()) as {
      data: { entries: Array<{ date: string; name: string }> };
    };
    expect(list.data.entries).toHaveLength(1);

    const restoreRes = await restoreRoute(
      post('/api/storage/trash/restore', { date: trashed.data.date, name: 'orphan.bin' }),
    );
    const restored = (await restoreRes.json()) as {
      data: { restored: string; recreatedRow: boolean; manifestApplied: boolean };
    };
    expect(restored.data).toMatchObject({
      restored: 'orphan.bin',
      recreatedRow: false,
      manifestApplied: false,
    });
    expect(existsSync(join(getDataDir('attachments'), 'orphan.bin'))).toBe(true);

    const purgeRes = await purgeRoute(post('/api/storage/trash/purge', {}));
    const purged = (await purgeRes.json()) as { data: { removedDates: string[] } };
    expect(purged.data.removedDates).toEqual([]);
  });
});
