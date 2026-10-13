/**
 * v0.6 M3 本地技能包领域类型（v1.7 从 domain.ts 抽出守行数门禁）。
 * MCP 领域类型（McpServerConfig/McpServerInfo/McpToolInfo）见 ./mcp。
 */
import type { PermissionLevel } from './permission';
import type { Timestamped } from './domain';

/** 技能包 manifest 中的单段提示词模板 */
export interface SkillPromptTemplate {
  name: string;
  order: number;
  content: string;
}

/** 技能包 manifest 中的使用示例 */
export interface SkillExample {
  title: string;
  userQuery: string;
  expectedBehavior?: string;
}

/** skill.json 的内存表示（zod 校验后） */
export interface SkillManifest {
  name: string;
  description: string;
  version: string;
  permissions: PermissionLevel[];
  promptTemplates: SkillPromptTemplate[];
  allowedTools: string[];
  examples: SkillExample[];
  author?: string;
}

/** 技能包在数据根 skills/<name> 目录下的磁盘表示 */
export interface SkillDiskEntry {
  /** 文件夹名（= manifest name） */
  name: string;
  /** manifest 绝对路径 */
  manifestPath: string;
  /** 文件夹绝对路径 */
  directoryPath: string;
  /** 加载/校验结果 */
  manifest: SkillManifest | null;
  /** 加载失败时给出具体原因 */
  error: string | null;
}

/** 启停状态（持久化在 skills_state 表） */
export interface SkillState extends Timestamped {
  id: string;
  /** 技能名（与磁盘文件夹名一致，唯一键） */
  name: string;
  /** 用户是否启用该技能 */
  enabled: boolean;
  /** 技能源文件夹绝对路径（搬迁或重装后可能失效，UI 应标红） */
  sourcePath: string;
}

/** 设置页技能列表视图 = skills_state 行 + 磁盘扫描结果（API 返回） */
export interface SkillInfo {
  /** skills_state 行 id（启停/删除引用用） */
  id: string;
  name: string;
  enabled: boolean;
  sourcePath: string;
  /** manifest 校验通过时为解析结果；失败或文件夹缺失为 null */
  manifest: SkillManifest | null;
  /** 加载/校验失败的具体原因；正常为 null */
  error: string | null;
  /** 源文件夹是否存在（false = 引用残留，UI 标红提示） */
  exists: boolean;
}
