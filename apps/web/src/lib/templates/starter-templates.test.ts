import { describe, expect, it } from 'vitest';
import { STARTER_KNOWLEDGE_BASES } from '@wbfm/shared/constants';
import { STARTER_FLOWS } from '@wbfm/core/flow';
import { BUILTIN_SKILLS } from '@wbfm/core/skills';
import {
  ASSISTANT_PRESET_BINDINGS,
  RESEARCH_KB_ID,
  STARTER_TEMPLATES,
  templatesOfKind,
} from './starter-templates';

/**
 * v2.4 P0-2（M2）· 模板清单漂移守卫（对应验收 A4/T1）：
 * 清单不得与三套 `ensure*` 播种真源漂移——id/名称逐条对齐，条目数一致。
 * 这样播种改了名字或多/少条目时，这里会先失败，而不是等到 e2e 才暴露。
 */
describe('starter-templates 与播种真源一致', () => {
  it('知识库 3 条：id/name 与 STARTER_KNOWLEDGE_BASES 对齐', () => {
    const items = templatesOfKind('knowledge');
    expect(items).toHaveLength(STARTER_KNOWLEDGE_BASES.length);
    expect(items.map((t) => [t.id, t.name])).toEqual(
      STARTER_KNOWLEDGE_BASES.map((kb) => [kb.id, kb.name]),
    );
  });

  it('工作流 6 条：id/name 与 STARTER_FLOWS 对齐', () => {
    const items = templatesOfKind('flow');
    expect(items).toHaveLength(STARTER_FLOWS.length);
    expect(items.map((t) => [t.id, t.name])).toEqual(
      STARTER_FLOWS.map((flow) => [flow.id, flow.name]),
    );
  });

  it('技能 3 条：id(name) 与 BUILTIN_SKILLS 对齐', () => {
    const items = templatesOfKind('skill');
    expect(items).toHaveLength(BUILTIN_SKILLS.length);
    expect(items.map((t) => t.id)).toEqual(BUILTIN_SKILLS.map((skill) => skill.name));
    for (const item of items) {
      expect(item.name).toContain(item.id);
    }
  });

  it('助手预设 3 条且绑定表齐全（角色卡 + 可选知识库）', () => {
    const items = templatesOfKind('assistant');
    expect(items).toHaveLength(3);
    for (const item of items) {
      const binding = ASSISTANT_PRESET_BINDINGS[item.id];
      expect(binding).toBeDefined();
      expect(binding!.cardId).toBeTruthy();
    }
    // 研究资料库 id 与知识库模板一致
    expect(ASSISTANT_PRESET_BINDINGS['assistant-research']!.knowledgeBaseId).toBe(RESEARCH_KB_ID);
  });

  it('冻结 15 条、每类首条为「推荐先用」、startAction 逐类正确', () => {
    expect(STARTER_TEMPLATES).toHaveLength(15);
    expect(new Set(STARTER_TEMPLATES.map((t) => t.id)).size).toBe(15);
    const expected: Record<string, 'clone' | 'enable' | 'prefill'> = {
      knowledge: 'clone',
      flow: 'clone',
      skill: 'enable',
      assistant: 'prefill',
    };
    for (const kind of ['knowledge', 'flow', 'skill', 'assistant'] as const) {
      const items = templatesOfKind(kind);
      expect(items.every((t) => t.startAction === expected[kind])).toBe(true);
      expect(items[0]!.recommended).toBe(true);
      expect(items.filter((t) => t.recommended)).toHaveLength(1);
    }
  });
});
