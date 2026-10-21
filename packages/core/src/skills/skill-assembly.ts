import type { Assistant } from '@wbfm/shared/types';
import type { EnabledSkill } from './skill-service';

/**
 * 启用技能的提示词模板拼接为 system 区块（① 提示词技能注入点）。
 * 技能按名称排序、模板按 order 升序，保证输出稳定；
 * 无模板的技能（纯工具组合）不产生文本，返回 null 时不注入。
 */
export function buildSkillPromptBlock(skills: EnabledSkill[]): string | null {
  const blocks: string[] = [];
  for (const skill of [...skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const templates = [...skill.manifest.promptTemplates].sort((a, b) => a.order - b.order);
    const body = templates
      .map((template) => template.content.trim())
      .filter(Boolean)
      .join('\n\n');
    if (!body) continue;
    blocks.push(`【技能：${skill.name}】${skill.manifest.description}\n${body}`);
  }
  if (blocks.length === 0) return null;
  return (
    '以下是已启用的技能提供的流程性知识，当用户请求命中对应场景时遵循其流程：\n\n' +
    blocks.join('\n\n')
  );
}

/**
 * 助手级技能筛选（v2.4 M4 / P1-2）：
 * - 助手未勾选任何技能（空数组）→ 跟随全局，返回全部已启用技能（v2.3 行为不变）；
 * - 助手勾选了技能 → 只保留这些；未在全局启用的技能自然被排除（停用即回收）。
 */
export function pickAssistantSkills(skills: EnabledSkill[], wanted: string[]): EnabledSkill[] {
  if (wanted.length === 0) return skills;
  const wantedSet = new Set(wanted);
  return skills.filter((skill) => wantedSet.has(skill.name));
}

/**
 * 技能预绑定工具并入助手可用工具集（② 工具组合技能生效点）。
 * 取并集而非交集：技能是用户显式启用的能力包，其声明的工具应立即可用；
 * 与助手白名单相互独立，停用技能即回收对应工具，不产生交叉心智负担。
 */
export function mergeSkillAllowedTools(assistant: Assistant, skills: EnabledSkill[]): Assistant {
  const skillTools = skills.flatMap((skill) => skill.manifest.allowedTools);
  if (skillTools.length === 0) return assistant;
  return {
    ...assistant,
    enabledTools: [...new Set([...assistant.enabledTools, ...skillTools])],
  };
}
