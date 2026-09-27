import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createSkillService, type SkillService } from './skill-service';

const VALID = (name: string) =>
  JSON.stringify({
    name,
    description: `${name} 描述`,
    promptTemplates: [{ name: 't', order: 0, content: '内容' }],
  });

function writeManifest(skillsDir: string, folder: string, content: string): string {
  const dir = join(skillsDir, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'skill.json'), content);
  return dir;
}

describe('skill-service（v0.6 M3）', () => {
  let db: DatabaseInstance;
  let skillsDir: string;
  let service: SkillService;

  beforeEach(() => {
    db = createDatabase();
    skillsDir = join(mkdtempSync(join(tmpdir(), 'wbfm-skills-svc-')), 'skills');
    service = createSkillService({ db }, { skillsDir });
  });

  afterEach(() => {
    db.close();
  });

  it('reconcile：播种内置 2 个技能并登记为启用；重复调用幂等', () => {
    service.reconcile();
    const list = service.list();
    expect(list.map((s) => s.name).sort()).toEqual(['meeting-notes', 'weekly-report']);
    for (const skill of list) {
      expect(skill.enabled).toBe(true);
      expect(skill.exists).toBe(true);
      expect(skill.error).toBeNull();
      expect(skill.manifest).not.toBeNull();
    }

    service.setEnabled(list[0]!.id, false);
    service.reconcile();
    const again = service.list();
    expect(again).toHaveLength(2);
    expect(again.find((s) => s.id === list[0]!.id)?.enabled).toBe(false);
  });

  it('seedBuiltins:false 时不播种，空目录 reconcile 后列表为空', () => {
    const bare = createSkillService({ db }, { skillsDir, seedBuiltins: false });
    bare.reconcile();
    expect(bare.list()).toEqual([]);
  });

  it('用户投放新技能文件夹后 reconcile 登记为启用；损坏 manifest 带错误登记', () => {
    const bare = createSkillService({ db }, { skillsDir, seedBuiltins: false });
    writeManifest(skillsDir, 'my-skill', VALID('my-skill'));
    writeManifest(skillsDir, 'bad-skill', '{ not json');
    bare.reconcile();

    const byName = new Map(bare.list().map((s) => [s.name, s]));
    expect(byName.get('my-skill')?.enabled).toBe(true);
    expect(byName.get('my-skill')?.manifest?.description).toBe('my-skill 描述');
    expect(byName.get('bad-skill')?.manifest).toBeNull();
    expect(byName.get('bad-skill')?.error).toContain('JSON 解析失败');
    expect(byName.get('bad-skill')?.exists).toBe(true);
  });

  it('setEnabled 切换并持久化；不存在抛 notFound', () => {
    service.reconcile();
    const target = service.list()[0]!;
    expect(service.setEnabled(target.id, false).enabled).toBe(false);
    expect(service.list().find((s) => s.id === target.id)!.enabled).toBe(false);
    expect(() => service.setEnabled('missing', true)).toThrowError(/技能不存在|未找到|not.?found/i);
  });

  it('remove 只删状态行不删源文件夹', () => {
    service.reconcile();
    const target = service.list().find((s) => s.name === 'weekly-report')!;
    service.remove(target.id);

    expect(service.list().find((s) => s.id === target.id)).toBeUndefined();
    expect(existsSync(join(skillsDir, 'weekly-report', 'skill.json'))).toBe(true);
    expect(() => service.remove(target.id)).toThrowError(/技能不存在|未找到|not.?found/i);
  });

  it('源文件夹被删后 list 标 exists=false 且给出原因', () => {
    service.reconcile();
    rmSync(join(skillsDir, 'weekly-report'), { recursive: true, force: true });

    const orphan = service.list().find((s) => s.name === 'weekly-report');
    expect(orphan?.exists).toBe(false);
    expect(orphan?.manifest).toBeNull();
    expect(orphan?.error).toContain('源文件夹不存在');
  });

  it('getEnabledSkills 只返回启用且 manifest 有效的技能', () => {
    service.reconcile();
    writeManifest(skillsDir, 'broken', '{ nope');
    // broken 尚未登记，手动再 reconcile 一次登记它
    service.reconcile();

    const weekly = service.list().find((s) => s.name === 'weekly-report')!;
    service.setEnabled(weekly.id, false);

    const enabled = service.getEnabledSkills();
    expect(enabled.map((s) => s.name)).toEqual(['meeting-notes']);
    expect(enabled[0]!.manifest.promptTemplates.length).toBeGreaterThan(0);
  });
});
