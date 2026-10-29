import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { skillManifestSchema, type CapabilityManifest } from '@wbfm/shared/schemas';
import type { McpRegistry } from '../mcp/registry';
import type { SkillService } from '../skills/skill-service';

/** v2.10 能力包 effect：本期只接入 skill / mcp；enable / disable 必须成对 */

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

export interface CapabilityEffectDeps {
  skills: SkillService;
  mcp: McpRegistry;
  skillsDir: string;
}

function readEntry(packDir: string, entry: string): string {
  return readFileSync(join(packDir, entry), 'utf8');
}

function enableSkill(packDir: string, deps: CapabilityEffectDeps): string {
  const parsed = skillManifestSchema.safeParse(
    JSON.parse(readEntry(packDir, 'payload/skill.json')),
  );
  if (!parsed.success) {
    throw ApiError.validation(
      `技能清单校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  const name = parsed.data.name;
  const target = join(deps.skillsDir, name);
  if (existsSync(target)) throw ApiError.conflict(`技能目录已存在：${name}`);
  cpSync(join(packDir, 'payload'), target, { recursive: true });
  deps.skills.reconcile();
  return name;
}

function disableSkill(effectRef: string, deps: CapabilityEffectDeps): void {
  const target = join(deps.skillsDir, effectRef);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  deps.skills.reconcile();
  const state = deps.skills.list().find((item) => item.name === effectRef);
  if (state) deps.skills.remove(state.id);
}

function enableMcp(packDir: string, manifest: CapabilityManifest, deps: CapabilityEffectDeps): string {
  const parsed = mcpEntrySchema.safeParse(JSON.parse(readEntry(packDir, manifest.entry)));
  if (!parsed.success) {
    throw ApiError.validation(
      `MCP 配置校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  const server = deps.mcp.createServer(parsed.data);
  return server.id;
}

function disableMcp(effectRef: string, deps: CapabilityEffectDeps): void {
  try {
    deps.mcp.removeServer(effectRef);
  } catch {
    /* 已不存在视为已撤销 */
  }
}

export function enableCapabilityEffect(
  manifest: CapabilityManifest,
  packDir: string,
  deps: CapabilityEffectDeps,
): string {
  if (manifest.kind === 'skill') return enableSkill(packDir, deps);
  if (manifest.kind === 'mcp') return enableMcp(packDir, manifest, deps);
  throw ApiError.validation(`该能力类型尚未接入：${manifest.kind}`);
}

export function disableCapabilityEffect(
  manifest: CapabilityManifest,
  effectRef: string,
  deps: CapabilityEffectDeps,
): void {
  if (manifest.kind === 'skill') return disableSkill(effectRef, deps);
  if (manifest.kind === 'mcp') return disableMcp(effectRef, deps);
}
