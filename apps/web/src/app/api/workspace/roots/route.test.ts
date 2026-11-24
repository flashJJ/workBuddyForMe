import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET, PUT } from './route';

describe('v5.1 授权根 API', () => {
  let db: DatabaseInstance;
  let root: string;
  let userRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-roots-route-'));
    userRoot = mkdtempSync(join(tmpdir(), 'wbfm-roots-user-'));
    setDataRootForTest(root);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    rmSync(root, { recursive: true, force: true });
    rmSync(userRoot, { recursive: true, force: true });
  });

  const put = (roots: string[]) =>
    PUT(
      new Request('http://x/api/workspace/roots', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roots }),
      }),
    );

  it('默认根可见，追加根持久化并回显', async () => {
    const initial = await GET(new Request('http://x/api/workspace/roots'));
    const initialBody = (await initial.json()) as {
      data: { roots: string[]; defaultRoot: string; maxRoots: number };
    };
    expect(initialBody.data.roots).toEqual([initialBody.data.defaultRoot]);
    expect(initialBody.data.maxRoots).toBe(8);

    const updated = await put([userRoot]);
    expect(updated.status).toBe(200);
    const body = (await updated.json()) as { data: { roots: string[] } };
    expect(body.data.roots).toEqual([initialBody.data.defaultRoot, userRoot]);
  });

  it('不存在的根与超限返回 422', async () => {
    const missing = await put([join(root, 'missing')]);
    expect(missing.status).toBe(422);

    const tooMany = Array.from({ length: 9 }, (_, index) => join(root, `r-${index}`));
    const limited = await put(tooMany);
    expect(limited.status).toBe(422);
  });
});
