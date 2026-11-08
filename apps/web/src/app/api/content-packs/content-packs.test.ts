import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET } from './route';
import { POST } from './import/route';
import { GET as GET_UPDATE } from './[id]/update-check/route';

const jsonRequest = (body: unknown) =>
  new Request('http://127.0.0.1/api/content-packs/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const updateRequest = (id: string) =>
  new Request(`http://127.0.0.1/api/content-packs/${id}/update-check`);

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
    vi.unstubAllGlobals();
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

  it('GET update-check 返回最新/有更新/不可用三种结果，网络失败不抛 500', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const call = (id: string) =>
      GET_UPDATE(updateRequest(id), { params: Promise.resolve({ id }) });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ sha: 'e2605d3e2242bd6216c9255192b8a8957a08c55a' }]), {
        status: 200,
      }),
    );
    const latest = await call('how-to-live-better');
    expect(latest.status).toBe(200);
    expect((await latest.json()).data).toMatchObject({
      status: 'latest',
      currentVersion: 'e2605d3',
      latestVersion: 'e2605d3',
      updateAvailable: false,
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]), {
        status: 200,
      }),
    );
    const changed = await call('how-to-live-better');
    expect((await changed.json()).data).toMatchObject({
      status: 'update-available',
      latestVersion: 'aaaaaaa',
      updateAvailable: true,
    });

    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 403 }));
    const unavailable = await call('how-to-live-better');
    expect(unavailable.status).toBe(200);
    const payload = (await unavailable.json()).data;
    expect(payload).toMatchObject({ status: 'unavailable', latestVersion: null });
    expect(payload.reason).toContain('403');

    fetchMock.mockClear();
    const missing = await call('missing-pack');
    expect(missing.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
