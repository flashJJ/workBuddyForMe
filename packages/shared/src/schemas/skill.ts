import { z } from 'zod';
import {
  SKILL_NAME_MAX,
  SKILL_NAME_PATTERN,
  SKILL_DESCRIPTION_MAX,
  SKILL_VERSION_MAX,
  SKILL_PROMPT_TEMPLATE_MAX,
  SKILL_MAX_PROMPT_TEMPLATES,
  SKILL_MAX_TOOLS,
  SKILL_MAX_EXAMPLES,
  QUALIFIED_TOOL_NAME_PATTERN,
} from '../constants';

/**
 * v0.6 M3 本地技能包 manifest schema（skill.json）。
 * 两类形态：
 * ① 提示词技能（promptTemplates 非空）：注入 system prompt 的流程性知识；
 * ② 工具组合技能（allowedTools 非空）：预绑定一组工具 + 推荐参数。
 * 两者可叠加（既有模板注入，又有工具预绑定）。
 */

const promptTemplateSchema = z.object({
  name: z.string().trim().min(1).max(SKILL_NAME_MAX),
  /** 注入 system prompt 的顺序；数字小在前 */
  order: z.number().int().min(0).max(999).default(0),
  /** 提示词正文 */
  content: z.string().trim().min(1).max(SKILL_PROMPT_TEMPLATE_MAX),
});

const exampleSchema = z.object({
  title: z.string().trim().min(1).max(SKILL_NAME_MAX),
  userQuery: z.string().trim().min(1).max(1000),
  expectedBehavior: z.string().trim().max(2000).optional(),
});

/** 技能触及的权限级别摘要（设置页展示；不代表放行，工具自身权限仍走 HITL） */
const skillPermissionSchema = z.enum(['read', 'write', 'danger']);

export const skillManifestSchema = z.object({
  /** 技能名称（与文件夹名一致，全局唯一标识） */
  name: z
    .string()
    .trim()
    .min(1, '名称不能为空')
    .max(SKILL_NAME_MAX, `名称最长 ${SKILL_NAME_MAX} 字符`)
    .regex(SKILL_NAME_PATTERN, '仅允许字母/数字/下划线/中划线，且以字母或数字开头'),
  /** 一句话描述 */
  description: z
    .string()
    .trim()
    .min(1, '描述不能为空')
    .max(SKILL_DESCRIPTION_MAX, `描述最长 ${SKILL_DESCRIPTION_MAX} 字符`),
  /** 语义版本，仅做展示 */
  version: z.string().trim().min(1).max(SKILL_VERSION_MAX).default('1.0.0'),
  /** 权限摘要：声明技能触及的最高权限级别（UI 展示用，不做运行时拦截） */
  permissions: z.array(skillPermissionSchema).max(3).default([]),
  /** 按场景注入 system prompt 的模板（① 提示词技能核心） */
  promptTemplates: z.array(promptTemplateSchema).max(SKILL_MAX_PROMPT_TEMPLATES).default([]),
  /** 预绑定工具（② 工具组合技能核心） */
  allowedTools: z
    .array(
      z.string().trim().regex(QUALIFIED_TOOL_NAME_PATTERN, '必须为内置工具名或 mcp:<server>:<tool>'),
    )
    .max(SKILL_MAX_TOOLS)
    .default([]),
  /** 使用示例（展示用） */
  examples: z.array(exampleSchema).max(SKILL_MAX_EXAMPLES).default([]),
  /** 作者或来源 */
  author: z.string().trim().max(100).optional(),
});
// 注：解析结果与 types/domain.ts 的 SkillManifest 接口结构一致，
// 此处不再导出同名推断类型以避免双份定义漂移。

/** PATCH /api/skills/:id 请求体：启停切换 */
export const skillUpdateSchema = z.object({
  enabled: z.boolean(),
});
export type SkillUpdateInput = z.infer<typeof skillUpdateSchema>;
