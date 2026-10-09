import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_MANIFEST_FILENAME, SKILL_NAME_PATTERN } from '@wbfm/shared/constants';
import { skillManifestSchema } from '@wbfm/shared/schemas';
import { type SkillDiskEntry, type SkillManifest } from '@wbfm/shared/types';

/** zod 校验失败时取前几条 issue 拼成可读原因（路径: 消息） */
interface ZodIssueLike {
  path: (string | number)[];
  message: string;
}

function formatIssues(issues: ZodIssueLike[]): string {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '(根)'}: ${issue.message}`)
    .join('；');
}

function loadOne(directoryPath: string, name: string): SkillDiskEntry {
  const manifestPath = join(directoryPath, SKILL_MANIFEST_FILENAME);
  const base: SkillDiskEntry = { name, manifestPath, directoryPath, manifest: null, error: null };

  if (!SKILL_NAME_PATTERN.test(name)) {
    return { ...base, error: '文件夹名不合法：仅允许字母/数字/下划线/中划线，且以字母或数字开头' };
  }
  if (!existsSync(manifestPath)) {
    return { ...base, error: `缺少 ${SKILL_MANIFEST_FILENAME} 清单文件` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { ...base, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = skillManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ...base, error: `manifest 校验失败：${formatIssues(parsed.error.issues)}` };
  }
  if (parsed.data.name !== name) {
    return { ...base, error: `manifest 名称「${parsed.data.name}」与文件夹名不一致` };
  }
  return { ...base, manifest: parsed.data as SkillManifest };
}

/**
 * 扫描技能目录：每个子文件夹视为一个技能包（skill.json manifest）。
 * 加载失败不静默——条目保留并带具体原因（缺 manifest / JSON 损坏 / 校验失败 / 名称不一致）。
 * 目录不存在或为空时返回空数组；按名称排序保证输出稳定。
 */
export function loadSkillsFromDisk(skillsDir: string): SkillDiskEntry[] {
  if (!existsSync(skillsDir)) return [];
  const entries: SkillDiskEntry[] = [];
  for (const dirent of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    entries.push(loadOne(join(skillsDir, dirent.name), dirent.name));
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}
