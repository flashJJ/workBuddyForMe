import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { buildSampleSkillPack } from '@wbfm/core/capabilities';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as listCapabilities } from './route';
import { POST as installCapability } from './install/route';
import { POST as enableCapability } from './[id]/enable/route';
import { POST as disableCapability } from './[id]/disable/route';
import { DELETE as uninstallCapability } from './[id]/route';
import { GET as sampleCapability } from './sample/route';

describe('v2.10 能力包 API', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-cap-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('示例包：下载 → 安装启用 → 停用 → 卸载', async () => {
    const sample = await sampleCapability(new Request('http://127.0.0.1/x'));
    expect(sample.headers.get('content-type')).toBe('application/zip');

    const form = new FormData();
    form.append(
      'file',
      new File([buildSampleSkillPack() as unknown as BlobPart], 'demo.zip', {
        type: 'application/zip',
      }),
    );
    const installed = await installCapability(
      new Request('http://127.0.0.1/x', { method: 'POST', body: form }),
    );
    expect(installed.status).toBe(201);
    const capability = (await installed.json()).data;
    expect(capability.status).toBe('enabled');
    expect(capability.effectRef).toBe('capability-demo');

    const services = __buildContainerForTest(db, createWebCipher());
    expect(services.skills.list().some((item) => item.name === 'capability-demo')).toBe(true);

    const disabled = await disableCapability(new Request('http://127.0.0.1/x', { method: 'POST' }), {
      params: Promise.resolve({ id: capability.id }),
    });
    expect((await disabled.json()).data.status).toBe('disabled');
    expect(services.skills.list().some((item) => item.name === 'capability-demo')).toBe(false);

    const enabled = await enableCapability(new Request('http://127.0.0.1/x', { method: 'POST' }), {
      params: Promise.resolve({ id: capability.id }),
    });
    expect((await enabled.json()).data.status).toBe('enabled');

    const removed = await uninstallCapability(new Request('http://127.0.0.1/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: capability.id }),
    });
    expect((await removed.json()).data.deleted).toBe(true);

    const list = await listCapabilities(new Request('http://127.0.0.1/x'));
    expect((await list.json()).data).toEqual([]);
  });

  it('安装缺失：非 ZIP / 缺 file 返回 422', async () => {
    const bad = await installCapability(
      new Request('http://127.0.0.1/x', {
        method: 'POST',
        body: new FormData(),
      }),
    );
    expect(bad.status).toBe(422);

    const notZip = new FormData();
    notZip.append('file', new File(['hello'], 'x.zip', { type: 'application/zip' }));
    const badZip = await installCapability(
      new Request('http://127.0.0.1/x', { method: 'POST', body: notZip }),
    );
    expect(badZip.status).toBe(422);
  });
});
