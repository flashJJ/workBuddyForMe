/**
 * v2.32 M3：产物清单与批量打包接口。
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { GET as listRoute } from '../route';
import { POST as exportRoute } from './route';

describe('/api/artifacts（v2.32 M3）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-artifacts-api-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __setContainerForTest(__buildContainerForTest(db, createWebCipher()));
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('清单返回产物，打包返回 tar.gz 与条目计数头', async () => {
    const ref = getServices().attachments.saveArtifact({
      title: '图',
      format: 'svg',
      filename: 'c.svg',
      content: '<svg></svg>',
    });

    const listRes = await listRoute(new Request('http://x/api/artifacts'));
    const listPayload = (await listRes.json()) as {
      data: { items: Array<{ id: string; filename: string }>; total: number };
    };
    expect(listPayload.data.total).toBe(1);
    expect(listPayload.data.items[0]).toMatchObject({ id: ref.attachmentId, filename: ref.filename });

    const exportRes = await exportRoute(
      new Request('http://x/api/artifacts/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [ref.attachmentId] }),
      }),
    );
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-type')).toBe('application/gzip');
    expect(exportRes.headers.get('x-artifact-count')).toBe('1');
    const archive = Buffer.from(await exportRes.arrayBuffer());
    expect(archive.byteLength).toBeGreaterThan(0);
  });

  it('空 ids 返回校验错误', async () => {
    const res = await exportRoute(
      new Request('http://x/api/artifacts/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [] }),
      }),
    );
    expect(res.status).toBe(422);
  });
});
