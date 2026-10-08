import { describe, expect, it } from 'vitest';
import type { Assistant, SkillManifest } from '@wbfm/shared/types';
import { buildSkillPromptBlock, mergeSkillAllowedTools } from './skill-assembly';
import type { EnabledSkill } from './skill-service';

function skill(name: string, overrides: Partial<SkillManifest> = {}): EnabledSkill {
  return {
    name,
    manifest: {
      name,
      description: `${name} 描述`,
      version: '1.0.0',
      permissions: [],
      promptTemplates: [],
      allowedTools: [],
      examples: [],
      ...overrides,
    },
  };
}

const ASSISTANT = {
  systemPrompt: '人设',
  enabledTools: ['current_time'],
} as Assistant;

describe('skill-assembly（v0.6 M3）', () => {
  it('buildSkillPromptBlock：空列表或无模板返回 null', () => {
    expect(buildSkillPromptBlock([])).toBeNull();
    expect(buildSkillPromptBlock([skill('tool-only', { allowedTools: ['current_time'] })])).toBeNull();
  });

  it('buildSkillPromptBlock：技能按名称排序，模板按 order 升序拼接', () => {
    const block = buildSkillPromptBlock([
      skill('b-skill', {
        promptTemplates: [
          { name: '后', order: 1, content: '第二段' },
          { name: '先', order: 0, content: '第一段' },
        ],
      }),
      skill('a-skill', {
        promptTemplates: [{ name: 't', order: 0, content: 'A 内容' }],
      }),
    ]);

    expect(block).not.toBeNull();
    const aIdx = block!.indexOf('【技能：a-skill】');
    const bIdx = block!.indexOf('【技能：b-skill】');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
    // b-skill 内部模板按 order 排序
    expect(block!.indexOf('第一段')).toBeLessThan(block!.indexOf('第二段'));
    expect(block).toContain('a-skill 描述');
  });

  it('mergeSkillAllowedTools：无技能工具时原样返回（同引用）', () => {
    expect(mergeSkillAllowedTools(ASSISTANT, [])).toBe(ASSISTANT);
    expect(mergeSkillAllowedTools(ASSISTANT, [skill('no-tools')])).toBe(ASSISTANT);
  });

  it('mergeSkillAllowedTools：与助手白名单取并集并去重', () => {
    const merged = mergeSkillAllowedTools(ASSISTANT, [
      skill('s1', { allowedTools: ['knowledge_search', 'current_time'] }),
      skill('s2', { allowedTools: ['mcp:fs:read_file', 'knowledge_search'] }),
    ]);
    expect(merged.enabledTools).toEqual([
      'current_time',
      'knowledge_search',
      'mcp:fs:read_file',
    ]);
    // 原助手对象不被修改
    expect(ASSISTANT.enabledTools).toEqual(['current_time']);
  });
});
