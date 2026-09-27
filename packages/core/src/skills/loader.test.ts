import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSkillsFromDisk } from './loader';

function tempSkillsDir(): string {
  return mkdtempSync(join(tmpdir(), 'wbfm-skills-loader-'));
}

function writeManifest(skillsDir: string, folder: string, content: string): void {
  const dir = join(skillsDir, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'skill.json'), content);
}

const VALID = JSON.stringify({
  name: 'weekly-report',
  description: '生成周报',
  promptTemplates: [{ name: '结构', content: '按四段输出' }],
});

describe('skills loader（v0.6 M3）', () => {
  it('目录不存在时返回空数组', () => {
    expect(loadSkillsFromDisk(join(tmpdir(), 'wbfm-skills-not-exist'))).toEqual([]);
  });

  it('合法技能加载成功，zod 默认值填充', () => {
    const dir = tempSkillsDir();
    writeManifest(dir, 'weekly-report', VALID);
    const entries = loadSkillsFromDisk(dir);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.error).toBeNull();
    expect(entry.manifest!.name).toBe('weekly-report');
    expect(entry.manifest!.version).toBe('1.0.0');
    expect(entry.manifest!.permissions).toEqual([]);
    expect(entry.manifest!.allowedTools).toEqual([]);
    expect(entry.directoryPath).toBe(join(dir, 'weekly-report'));
  });

  it('散文件（非目录）被跳过', () => {
    const dir = tempSkillsDir();
    writeFileSync(join(dir, 'README.md'), 'not a skill');
    writeManifest(dir, 'weekly-report', VALID);
    const entries = loadSkillsFromDisk(dir);
    expect(entries.map((e) => e.name)).toEqual(['weekly-report']);
  });

  it('缺少 skill.json：保留条目并给出具体原因', () => {
    const dir = tempSkillsDir();
    mkdirSync(join(dir, 'empty-skill'));
    const entries = loadSkillsFromDisk(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.manifest).toBeNull();
    expect(entries[0]!.error).toContain('缺少 skill.json');
  });

  it('JSON 损坏 / schema 校验失败 / 名称不一致 / 文件夹名不合法：均带具体原因', () => {
    const dir = tempSkillsDir();
    writeManifest(dir, 'broken-json', '{ not json');
    writeManifest(dir, 'broken-schema', JSON.stringify({ name: 'broken-schema' }));
    writeManifest(dir, 'name-mismatch', JSON.stringify({ name: 'other-name', description: 'x' }));
    mkdirSync(join(dir, '.hidden'));

    const byName = new Map(loadSkillsFromDisk(dir).map((e) => [e.name, e]));
    expect(byName.get('broken-json')!.error).toContain('JSON 解析失败');
    expect(byName.get('broken-schema')!.error).toContain('manifest 校验失败');
    expect(byName.get('broken-schema')!.error).toContain('description');
    expect(byName.get('name-mismatch')?.error).toContain('与文件夹名不一致');
    expect(byName.get('.hidden')?.error).toContain('文件夹名不合法');
  });
});
