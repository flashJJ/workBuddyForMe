import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET } from './route';
import { POST } from './import/route';

const jsonRequest = (body: unknown) =>
  new Request('http://127.0.0.1/api/content-packs/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('内容包路由（v2.18 M4）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-content-pack-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('GET 返回清单：未导入、含来源/许可/文件数与哈希', async () => {
    const response = await GET(new Request('http://127.0.0.1/api/content-packs'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toEqual([
      expect.objectContaining({
        id: 'how-to-live-better',
        name: '高性价比人生指南',
        license: 'CC BY 4.0',
        fileCount: 34,
        totalBytes: 2385074,
        imported: false,
      }),
    ]);
  });

  it('POST 未知 id 返回 404；空 id 返回 422', async () => {
    const missing = await POST(jsonRequest({ id: 'missing-pack' }));
    expect(missing.status).toBe(404);

    const invalid = await POST(jsonRequest({ id: '   ' }));
    expect(invalid.status).toBe(422);
  });
});
