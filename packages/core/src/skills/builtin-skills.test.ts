import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS, ensureBuiltinSkills } from './builtin-skills';
import { loadSkillsFromDisk } from './loader';

describe('内置示例技能播种（v0.6 M3）', () => {
  it('首次播种生成周报与纪要两个技能，manifest 可被 loader 校验通过', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbfm-skills-seed-'));
    ensureBuiltinSkills(dir);

    const entries = loadSkillsFromDisk(dir);
    expect(entries.map((e) => e.name).sort()).toEqual(['meeting-notes', 'weekly-report']);
    for (const entry of entries) {
      expect(entry.error).toBeNull();
      expect(entry.manifest).not.toBeNull();
    }
    // 周报技能预绑定知识库检索工具（工具组合形态示范）
    const weekly = entries.find((e) => e.name === 'weekly-report');
    expect(weekly!.manifest!.allowedTools).toContain('knowledge_search');
    expect(weekly!.manifest!.promptTemplates.length).toBeGreaterThan(0);
  });

  it('幂等：manifest 已存在时不覆盖用户改动', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbfm-skills-seed-'));
    ensureBuiltinSkills(dir);
    const manifestPath = join(dir, BUILTIN_SKILLS[0]!.name, 'skill.json');
    writeFileSync(manifestPath, '{"name":"weekly-report","description":"用户改过的描述"}');

    ensureBuiltinSkills(dir);
    expect(readFileSync(manifestPath, 'utf8')).toContain('用户改过的描述');
  });
});
