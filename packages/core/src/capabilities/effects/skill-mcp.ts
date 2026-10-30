import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { skillManifestSchema, type CapabilityManifest } from '@wbfm/shared/schemas';
import type { SkillService } from '../../skills/skill-service';

const mcpEntrySchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    transport: z.enum(['stdio', 'http']),
    command: z.string().trim().min(1).optional(),
    args: z.array(z.string()).max(50).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().trim().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.transport === 'stdio' && !value.command) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'stdio 服务器必须提供 command' });
    }
    if (value.transport === 'http' && !value.url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'http 服务器必须提供 url' });
    }
  });

export interface SkillEffectDeps {
  skills: SkillService;
  skillsDir: string;
}

export interface McpEffectDeps {
  mcp: {
    createServer: (input: z.infer<typeof mcpEntrySchema>) => { id: string };
    removeServer: (id: string) => void;
  };
}

function readEntry(packDir: string, entry: string): string {
  return readFileSync(join(packDir, entry), 'utf8');
}

function parseSkillManifest(packDir: string) {
  const parsed = skillManifestSchema.safeParse(
    JSON.parse(readEntry(packDir, 'payload/skill.json')),
  );
  if (!parsed.success) {
    throw ApiError.validation(
      `技能清单校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** v2.12：升级预检读取技能名（用于排除旧技能自身的目录冲突） */
export function readSkillName(packDir: string): string {
  return parseSkillManifest(packDir).name;
}

function parseMcpEntry(packDir: string, manifest: CapabilityManifest) {
  const parsed = mcpEntrySchema.safeParse(JSON.parse(readEntry(packDir, manifest.entry)));
  if (!parsed.success) {
    throw ApiError.validation(
      `MCP 配置校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** v2.12：升级预检读取 MCP 服务器名（名称唯一，冲突需在 disable 前发现） */
export function readMcpServerName(packDir: string, manifest: CapabilityManifest): string {
  return parseMcpEntry(packDir, manifest).name;
}

export function enableSkill(packDir: string, deps: SkillEffectDeps): string {
  const name = parseSkillManifest(packDir).name;
  const target = join(deps.skillsDir, name);
  if (existsSync(target)) throw ApiError.conflict(`技能目录已存在：${name}`);
  cpSync(join(packDir, 'payload'), target, { recursive: true });
  deps.skills.reconcile();
  return name;
}

export function disableSkill(effectRef: string, deps: SkillEffectDeps): void {
  const target = join(deps.skillsDir, effectRef);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  deps.skills.reconcile();
  const state = deps.skills.list().find((item) => item.name === effectRef);
  if (state) deps.skills.remove(state.id);
}

export function enableMcp(
  packDir: string,
  manifest: CapabilityManifest,
  deps: McpEffectDeps,
): string {
  const server = deps.mcp.createServer(parseMcpEntry(packDir, manifest));
  return server.id;
}

export function disableMcp(effectRef: string, deps: McpEffectDeps): void {
  try {
    deps.mcp.removeServer(effectRef);
  } catch {
    /* 已不存在视为已撤销 */
  }
}
