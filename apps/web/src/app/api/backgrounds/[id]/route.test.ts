import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { GET } from './route';

const ID = '11111111-1111-4111-8111-111111111111.png';

let root = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-bg-route-'));
  setDataRootForTest(root);
});

afterEach(() => {
  resetDataRootForTest();
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // Windows 偶发句柄占用：临时目录留给系统清理，不阻断测试结果
  }
});

function call(id: string): Promise<Response> {
  return GET(new Request(`http://local/api/backgrounds/${encodeURIComponent(id)}`), {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/backgrounds/[id]', () => {
  it('返回受控目录内的背景文件', async () => {
    const dir = path.join(root, 'backgrounds');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ID), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const res = await call(ID);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('文件缺失返回 404', async () => {
    const res = await call(ID);
    expect(res.status).toBe(404);
  });

  it('非法 id 返回 422', async () => {
    const res = await call('../secret.png');
    expect(res.status).toBe(422);
  });
});
