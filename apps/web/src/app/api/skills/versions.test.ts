import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { getDataDir, resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { GET as listSkills } from './route';
import { GET as listVersions } from './[id]/versions/route';
import { DELETE as deleteVersion } from './[id]/versions/[version]/route';
import { POST as rollbackVersion } from './[id]/versions/[version]/rollback/route';

function writeSkill(name: string, version: string, content: string): void {
  const dir = join(getDataDir('skills'), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'skill.json'),
    JSON.stringify({
      name,
      description: `${name} ${version}`,
      version,
      promptTemplates: [{ name: 't', order: 0, content }],
    }),
  );
}

const nameParams = (id: string) => ({ params: Promise.resolve({ id }) });
const versionParams = (id: string, version: string) => ({
  params: Promise.resolve({ id, version }),
});

async function readData<T>(response: Response): Promise<T> {
  return (await response.json()).data as T;
}

describe('技能版本路由（v2.14）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-skill-versions-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('GET：扫描后返回版本快照并标记 active；新版本建立历史', async () => {
    writeSkill('my-skill', '1.0.0', '旧内容');
    getServices().skills.reconcile();

    const first = await listVersions(new Request('http://x'), nameParams('my-skill'));
    expect(first.status).toBe(200);
    const firstData = await readData<{
      versions: Array<{ version: string; active: boolean }>;
      versioningAvailable: boolean;
      totalBytes: number;
    }>(first);
    expect(firstData.versioningAvailable).toBe(true);
    expect(firstData.versions).toHaveLength(1);
    expect(firstData.versions[0]).toMatchObject({ version: '1.0.0', active: true });
    expect(firstData.totalBytes).toBeGreaterThan(0);

    writeSkill('my-skill', '2.0.0', '新内容');
    getServices().skills.reconcile();

    const second = await readData<{ versions: Array<{ version: string; active: boolean }> }>(
      await listVersions(new Request('http://x'), nameParams('my-skill')),
    );
    expect(second.versions.map((item) => item.version)).toEqual(['2.0.0', '1.0.0']);
    expect(second.versions.find((item) => item.version === '1.0.0')?.active).toBe(false);
  });

  it('POST rollback：恢复旧版本文件并保持启用态；列表重新标记 active', async () => {
    writeSkill('my-skill', '1.0.0', '旧内容');
    getServices().skills.reconcile();
    const state = (await readData<Array<{ id: string; name: string }>>(
      await listSkills(new Request('http://x')),
    )).find((item) => item.name === 'my-skill')!;
    getServices().skills.setEnabled(state.id, false);

    writeSkill('my-skill', '2.0.0', '新内容');
    getServices().skills.reconcile();

    const response = await rollbackVersion(
      new Request('http://x', { method: 'POST' }),
      versionParams('my-skill', '1.0.0'),
    );
    expect(response.status).toBe(200);
    const data = await readData<{ versions: Array<{ version: string; active: boolean }> }>(
      response,
    );
    expect(data.versions.find((item) => item.version === '1.0.0')?.active).toBe(true);

    const skills = await readData<Array<{ name: string; enabled: boolean; manifest: unknown }>>(
      await listSkills(new Request('http://x')),
    );
    const rolled = skills.find((item) => item.name === 'my-skill')!;
    expect(rolled.enabled).toBe(false);
    expect((rolled.manifest as { version: string }).version).toBe('1.0.0');
  });

  it('错误：版本不存在 409；非法技能名 422；无快照返回空列表', async () => {
    writeSkill('my-skill', '1.0.0', '内容');
    getServices().skills.reconcile();

    const missing = await rollbackVersion(
      new Request('http://x', { method: 'POST' }),
      versionParams('my-skill', '9.9.9'),
    );
    expect(missing.status).toBe(409);
    expect((await missing.json()).error.code).toBe('SKILL_VERSION_MISSING');

    const invalid = await rollbackVersion(
      new Request('http://x', { method: 'POST' }),
      versionParams('../evil', '1.0.0'),
    );
    expect(invalid.status).toBe(422);

    const empty = await readData<{
      versions: unknown[];
      versioningAvailable: boolean;
      totalBytes: number;
    }>(await listVersions(new Request('http://x'), nameParams('missing-skill')));
    expect(empty.versions).toEqual([]);
    expect(empty.versioningAvailable).toBe(false);
    expect(empty.totalBytes).toBe(0);
  });

  it('v2.15 DELETE：删除非启用版本并写审计；active / 缺失版本拒绝', async () => {
    writeSkill('my-skill', '1.0.0', '旧内容');
    getServices().skills.reconcile();
    writeSkill('my-skill', '2.0.0', '新内容');
    getServices().skills.reconcile();

    const before = await readData<{ totalBytes: number }>(
      await listVersions(new Request('http://x'), nameParams('my-skill')),
    );
    const response = await deleteVersion(
      new Request('http://x', { method: 'DELETE' }),
      versionParams('my-skill', '1.0.0'),
    );
    expect(response.status).toBe(200);
    const data = await readData<{
      deleted: { version: string; rowsRemoved: number; freedBytes: number; dirDeleted: boolean };
      versions: { versions: Array<{ version: string }>; totalBytes: number };
    }>(response);
    expect(data.deleted).toMatchObject({ version: '1.0.0', rowsRemoved: 1, dirDeleted: true });
    expect(data.deleted.freedBytes).toBeGreaterThan(0);
    expect(data.versions.versions.map((item) => item.version)).toEqual(['2.0.0']);
    expect(data.versions.totalBytes).toBeLessThan(before.totalBytes);

    const audit = getServices().audit.list({ kind: 'skill_version_deleted', limit: 10 });
    expect(audit.events[0]).toMatchObject({ kind: 'skill_version_deleted', actor: 'user' });

    const active = await deleteVersion(
      new Request('http://x', { method: 'DELETE' }),
      versionParams('my-skill', '2.0.0'),
    );
    expect(active.status).toBe(409);
    expect((await active.json()).error.code).toBe('SKILL_VERSION_ACTIVE');

    const missing = await deleteVersion(
      new Request('http://x', { method: 'DELETE' }),
      versionParams('my-skill', '9.9.9'),
    );
    expect(missing.status).toBe(409);
    expect((await missing.json()).error.code).toBe('SKILL_VERSION_MISSING');
  });
});
