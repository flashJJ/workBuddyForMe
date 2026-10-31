import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createSkillStateRepository,
  createSkillVersionRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { createSkillService } from './skill-service';

const skillJson = (name: string, version: string, content: string) =>
  JSON.stringify({
    name,
    description: `${name} ${version}`,
    version,
    promptTemplates: [{ name: 't', order: 0, content }],
  });

function writeSkill(
  skillsDir: string,
  name: string,
  version: string,
  content = `内容 ${version}`,
): void {
  const dir = join(skillsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'skill.json'), skillJson(name, version, content));
}

describe('skill-version-service（v2.14）', () => {
  let db: DatabaseInstance;
  let root: string;
  let skillsDir: string;
  let versionsDir: string;

  beforeEach(() => {
    db = createDatabase();
    root = mkdtempSync(join(tmpdir(), 'wbfm-skill-versions-'));
    skillsDir = join(root, 'skills');
    versionsDir = join(root, 'skill-versions');
    mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  function createService(extra: { keepVersions?: number; maxSnapshotBytes?: number } = {}) {
    return createSkillService(
      { db },
      { skillsDir, versionsDir, seedBuiltins: false, ...extra },
    );
  }

  it('reconcile 建立快照：checksum 可复现、active 标记当前版本', () => {
    const service = createService();
    writeSkill(skillsDir, 'my-skill', '1.0.0');
    service.reconcile();

    const stateId = service.list()[0]!.id;
    const snapshot = join(versionsDir, stateId, '1.0.0', 'skill.json');
    expect(existsSync(snapshot)).toBe(true);
    expect(readFileSync(snapshot, 'utf8')).toContain('"version":"1.0.0"');

    const versions = service.listVersions('my-skill');
    expect(versions.versioningAvailable).toBe(true);
    expect(versions.versions).toHaveLength(1);
    expect(versions.versions[0]).toMatchObject({ version: '1.0.0', active: true });
    expect(versions.versions[0]!.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(versions.versions[0]!.sizeBytes).toBeGreaterThan(0);
  });

  it('同版本同内容不重复；同版本内容变化覆盖快照', () => {
    const service = createService();
    writeSkill(skillsDir, 'my-skill', '1.0.0');
    service.reconcile();
    const first = service.listVersions('my-skill').versions[0]!;

    service.reconcile();
    expect(service.listVersions('my-skill').versions).toHaveLength(1);

    writeSkill(skillsDir, 'my-skill', '1.0.0', '内容已修改');
    service.reconcile();
    const updated = service.listVersions('my-skill').versions[0]!;
    expect(updated.checksum).not.toBe(first.checksum);
    expect(readFileSync(join(versionsDir, service.list()[0]!.id, '1.0.0', 'skill.json'), 'utf8'))
      .toContain('内容已修改');
  });

  it('回退恢复文件内容，启用状态不变，历史版本保留', () => {
    const service = createService();
    writeSkill(skillsDir, 'my-skill', '1.0.0', '旧内容');
    service.reconcile();
    const state = service.list()[0]!;
    service.setEnabled(state.id, false);

    writeSkill(skillsDir, 'my-skill', '2.0.0', '新内容');
    service.reconcile();
    expect(service.listVersions('my-skill').versions.map((item) => item.version)).toEqual([
      '2.0.0',
      '1.0.0',
    ]);

    service.rollbackVersion('my-skill', '1.0.0');
    const rolled = service.list()[0]!;
    expect(rolled.manifest?.version).toBe('1.0.0');
    expect(rolled.enabled).toBe(false);
    expect(readFileSync(join(skillsDir, 'my-skill', 'skill.json'), 'utf8')).toContain('旧内容');
    const versions = service.listVersions('my-skill');
    expect(versions.versions.find((item) => item.version === '1.0.0')?.active).toBe(true);
    expect(versions.versions.find((item) => item.version === '2.0.0')?.active).toBe(false);

    // 模拟重启：同一数据库 + 同一技能目录重新扫描，回退结果保持
    const restarted = createService();
    restarted.reconcile();
    expect(restarted.list()[0]!.manifest?.version).toBe('1.0.0');
    expect(
      restarted.listVersions('my-skill').versions.find((item) => item.version === '1.0.0')?.active,
    ).toBe(true);
  });

  it('回退缺失版本返回 409；技能不存在返回 404', async () => {
    const service = createService();
    writeSkill(skillsDir, 'my-skill', '1.0.0');
    service.reconcile();
    await expect(async () =>
      service.rollbackVersion('my-skill', '9.9.9'),
    ).rejects.toMatchObject({ code: 'SKILL_VERSION_MISSING', status: 409 });
    await expect(async () =>
      service.rollbackVersion('missing', '1.0.0'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('状态行重建后历史仍连续（能力包升级场景）', () => {
    const service = createService();
    writeSkill(skillsDir, 'my-skill', '1.0.0');
    service.reconcile();
    const firstStateId = service.list()[0]!.id;
    createSkillStateRepository(db).removeByName('my-skill');

    service.reconcile();
    const secondStateId = service.list()[0]!.id;
    expect(secondStateId).not.toBe(firstStateId);

    const versions = service.listVersions('my-skill');
    expect(versions.versions).toHaveLength(1);
    expect(versions.versions[0]).toMatchObject({ version: '1.0.0', active: true });
    // 同版本同 checksum 复用旧快照目录，不复制第二份
    expect(existsSync(join(versionsDir, firstStateId, '1.0.0'))).toBe(true);
    expect(existsSync(join(versionsDir, secondStateId, '1.0.0'))).toBe(false);
  });

  it('超过体积上限：不建快照、列表 versioningAvailable=false', () => {
    const service = createService({ maxSnapshotBytes: 200 });
    const dir = join(skillsDir, 'big-skill');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'skill.json'), skillJson('big-skill', '1.0.0', '内容'));
    writeFileSync(join(dir, 'payload.bin'), Buffer.alloc(300, 1));
    service.reconcile();

    const versions = service.listVersions('big-skill');
    expect(versions.versions).toEqual([]);
    expect(versions.versioningAvailable).toBe(false);
    expect(createSkillStateRepository(db).getByName('big-skill')?.activeVersion).toBeNull();
  });

  it('自动保留最近 5 版；回退目标仍在保留窗口内', () => {
    const service = createService();
    for (let index = 1; index <= 6; index += 1) {
      writeSkill(skillsDir, 'my-skill', `${index}.0.0`);
      service.reconcile();
    }
    expect(
      service
        .listVersions('my-skill')
        .versions.map((item) => item.version)
        .sort(),
    ).toEqual(['2.0.0', '3.0.0', '4.0.0', '5.0.0', '6.0.0']);

    service.rollbackVersion('my-skill', '2.0.0');
    const rolled = service.listVersions('my-skill').versions;
    expect(rolled).toHaveLength(5);
    expect(rolled.find((item) => item.version === '2.0.0')?.active).toBe(true);

    writeSkill(skillsDir, 'my-skill', '7.0.0');
    service.reconcile();
    const versions = service.listVersions('my-skill').versions;
    expect(versions).toHaveLength(5);
    expect(versions.map((item) => item.version).sort()).toEqual([
      '3.0.0',
      '4.0.0',
      '5.0.0',
      '6.0.0',
      '7.0.0',
    ]);
    expect(versions.find((item) => item.version === '7.0.0')?.active).toBe(true);
  });

  it('v2.15 删除非启用版本：列表、目录与占用同步减少；active 与最后一份受保护', async () => {
    const service = createService();
    writeSkill(skillsDir, 'my-skill', '1.0.0', '旧内容');
    service.reconcile();
    writeSkill(skillsDir, 'my-skill', '2.0.0', '新内容');
    service.reconcile();

    const before = service.listVersions('my-skill');
    expect(before.totalBytes).toBeGreaterThan(0);
    expect(before.versions.map((item) => item.version)).toEqual(['2.0.0', '1.0.0']);

    const deleted = service.deleteVersion('my-skill', '1.0.0');
    expect(deleted.deleted).toMatchObject({
      version: '1.0.0',
      rowsRemoved: 1,
      dirDeleted: true,
    });
    expect(deleted.deleted.freedBytes).toBeGreaterThan(0);
    expect(deleted.versions.versions.map((item) => item.version)).toEqual(['2.0.0']);
    expect(deleted.versions.totalBytes).toBeLessThan(before.totalBytes);

    await expect(async () =>
      service.deleteVersion('my-skill', '2.0.0'),
    ).rejects.toMatchObject({ code: 'SKILL_VERSION_ACTIVE', status: 409 });
    await expect(async () =>
      service.deleteVersion('my-skill', '9.9.9'),
    ).rejects.toMatchObject({ code: 'SKILL_VERSION_MISSING', status: 409 });
  });

  it('v2.15 状态行重建后同版本多行一次删除；仅剩一个版本时拒绝', async () => {
    const service = createService();
    writeSkill(skillsDir, 'my-skill', '1.0.0');
    service.reconcile();
    const firstStateId = service.list()[0]!.id;
    createSkillStateRepository(db).removeByName('my-skill');
    service.reconcile();
    writeSkill(skillsDir, 'my-skill', '2.0.0');
    service.reconcile();

    // 注入历史状态行遗留的同版本行，验证删除会跨状态行清理并复用同一目录
    const versionRepo = createSkillVersionRepository(db);
    const v1Row = versionRepo.listByNameVersion('my-skill', '1.0.0')[0]!;
    versionRepo.create({
      skillStateId: firstStateId,
      name: v1Row.name,
      version: v1Row.version,
      checksum: v1Row.checksum,
      manifestJson: v1Row.manifest_json,
      dirPath: v1Row.dir_path,
    });

    const deleted = service.deleteVersion('my-skill', '1.0.0');
    expect(deleted.deleted.rowsRemoved).toBe(2);
    expect(deleted.deleted.dirDeleted).toBe(true);
    expect(existsSync(join(versionsDir, firstStateId, '1.0.0'))).toBe(false);

    createSkillStateRepository(db).update(service.list()[0]!.id, { activeVersion: '9.9.9' });
    await expect(async () =>
      service.deleteVersion('my-skill', '2.0.0'),
    ).rejects.toMatchObject({ code: 'SKILL_VERSION_LAST', status: 409 });
  });
});
