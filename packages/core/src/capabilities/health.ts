import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CapabilityCleanupResult,
  CapabilityHealth,
  CapabilityHealthIssue,
  CapabilityHealthReport,
  CapabilityManifest,
  CapabilityView,
} from '@wbfm/shared/schemas';
import { capabilityManifestSchema } from '@wbfm/shared/schemas';
import type { CapabilityRepository } from '@wbfm/database';
import type { CapabilityEffectDeps } from './effects';
import { verifyCapabilitySignature } from './signature';

/**
 * v2.12 M3：能力包健康自检与无主目录清理。
 * 只读数据库行 + 磁盘；单包探测异常转 issue，不中断整份报告。
 */

const STALE_MS = 24 * 60 * 60 * 1000;
const PROTECTED_DIRS = new Set(['.staging', '.backup']);

export interface HealthScanInput {
  repo: CapabilityRepository;
  effects: CapabilityEffectDeps;
  rootDir: string;
  trustedKeys: Parameters<typeof verifyCapabilitySignature>[1];
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** 仓储只做 JSON.parse；健康检查必须再走一遍 schema，避免坏 JSON 结构进入探测 */
function readManifest(repo: CapabilityRepository, id: string): CapabilityManifest | null {
  try {
    const raw = repo.getManifest(id);
    if (!raw) return null;
    const parsed = capabilityManifestSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function issue(
  code: CapabilityHealthIssue['code'],
  severity: CapabilityHealthIssue['severity'],
  message: string,
  detail?: string,
): CapabilityHealthIssue {
  return { code, severity, message, detail };
}

/** 递归列出相对路径（统一正斜杠，与清单 checksums 一致） */
function walkFiles(root: string, prefix = ''): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out;
}

function checkChecksums(packDir: string, manifest: CapabilityManifest): CapabilityHealthIssue[] {
  const issues: CapabilityHealthIssue[] = [];
  for (const [relative, expected] of Object.entries(manifest.checksums)) {
    const target = join(packDir, ...relative.split('/'));
    if (!existsSync(target)) {
      issues.push(
        issue('checksum_mismatch', 'error', `payload 文件缺失：${relative}`, relative),
      );
      continue;
    }
    const actual = sha256(readFileSync(target));
    if (actual !== expected) {
      issues.push(
        issue('checksum_mismatch', 'error', `payload 校验和不匹配：${relative}`, relative),
      );
    }
  }
  const payloadFiles = walkFiles(join(packDir, 'payload'), 'payload');
  for (const relative of payloadFiles) {
    if (!(relative in manifest.checksums)) {
      issues.push(
        issue('payload_extra_file', 'warn', `payload 存在未登记文件：${relative}`, relative),
      );
    }
  }
  return issues;
}

function checkDependencies(
  manifest: CapabilityManifest,
  installed: CapabilityView[],
): CapabilityHealthIssue[] {
  const issues: CapabilityHealthIssue[] = [];
  for (const dependency of manifest.dependencies) {
    const hit = installed.find((item) => item.id === dependency.id);
    if (!hit) {
      issues.push(
        issue('dependency_missing', 'error', `依赖未安装：${dependency.id}`, dependency.id),
      );
      continue;
    }
    if (hit.status !== 'enabled') {
      issues.push(
        issue('dependency_disabled', 'warn', `依赖未启用：${dependency.id}`, dependency.id),
      );
    }
    if (dependency.version && hit.version !== dependency.version) {
      issues.push(
        issue(
          'dependency_version_mismatch',
          'error',
          `依赖版本不匹配：${dependency.id} 需要 ${dependency.version}，已安装 ${hit.version}`,
          dependency.id,
        ),
      );
    }
  }
  return issues;
}

function checkEffect(
  view: CapabilityView,
  manifest: CapabilityManifest,
  effects: CapabilityEffectDeps,
): CapabilityHealthIssue[] {
  if (view.status !== 'enabled') return [];
  const ref = view.effectRef;
  if (!ref) return [issue('effect_missing', 'error', '包已启用但未记录 effect 句柄')];

  if (manifest.kind === 'skill') {
    const listed = effects.skills.list().some((item) => item.name === ref);
    const dirExists = existsSync(join(effects.skillsDir, ref));
    if (!listed || !dirExists) {
      return [issue('effect_missing', 'error', `技能不存在：${ref}`, ref)];
    }
  }
  if (manifest.kind === 'mcp') {
    if (!effects.mcp.getServerInfos().some((item) => item.id === ref)) {
      return [issue('effect_missing', 'error', `MCP 服务器不存在：${ref}`, ref)];
    }
  }
  if (manifest.kind === 'workflow') {
    const workflow = effects.workflows.getWorkflow(ref);
    if (!workflow) return [issue('effect_missing', 'error', `工作流不存在：${ref}`, ref)];
    if (workflow.status !== 'published') {
      return [
        issue(
          'effect_status_mismatch',
          'error',
          `包已启用但工作流状态为 ${workflow.status}`,
          ref,
        ),
      ];
    }
  }
  if (manifest.kind === 'pet-action') {
    const motion = effects.motions.get(ref);
    if (!motion) return [issue('effect_missing', 'error', `动作资产不存在：${ref}`, ref)];
    try {
      effects.motions.readFile(motion.fileRef);
    } catch {
      return [
        issue('effect_missing', 'error', `动作文件缺失：${motion.fileRef}`, motion.fileRef),
      ];
    }
  }
  if (manifest.kind === 'event-script') {
    const script = effects.eventScripts.get(ref);
    if (!script) return [issue('effect_missing', 'error', `剧本不存在：${ref}`, ref)];
    if (!script.enabled) {
      return [issue('effect_status_mismatch', 'error', '包已启用但剧本处于停用状态', ref)];
    }
  }
  if (manifest.kind === 'report-widget') {
    if (!effects.reportWidgets.get(ref)) {
      return [issue('effect_missing', 'error', `报告卡片不存在：${ref}`, ref)];
    }
  }
  return [];
}

function scanPack(
  view: CapabilityView,
  input: HealthScanInput,
  installed: CapabilityView[],
): CapabilityHealth {
  const issues: CapabilityHealthIssue[] = [];
  const packDir = join(input.rootDir, view.id);
  if (!existsSync(packDir)) {
    issues.push(issue('pack_dir_missing', 'error', `能力包目录缺失：${view.id}`, view.id));
  }
  const manifest = readManifest(input.repo, view.id);
  if (!manifest) {
    issues.push(issue('manifest_invalid', 'error', '能力包清单无法解析或校验失败'));
  } else {
    if (existsSync(packDir)) issues.push(...checkChecksums(packDir, manifest));
    issues.push(...checkDependencies(manifest, installed));
    try {
      issues.push(...checkEffect(view, manifest, input.effects));
    } catch (error) {
      issues.push(
        issue(
          'effect_missing',
          'error',
          'effect 探测异常',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
    const signature = verifyCapabilitySignature(manifest, input.trustedKeys);
    if (signature.status === 'invalid' || signature.status === 'malformed') {
      issues.push(
        issue(
          'signature_invalid',
          'error',
          `签名无效：${signature.reason ?? signature.status}`,
          manifest.signatureKeyId,
        ),
      );
    } else if (signature.status === 'untrusted') {
      issues.push(
        issue(
          'signature_untrusted',
          'warn',
          `签名密钥未知：${manifest.signatureKeyId ?? '未指定 keyId'}`,
          manifest.signatureKeyId,
        ),
      );
    }
  }
  const status = issues.some((item) => item.severity === 'error')
    ? 'broken'
    : issues.length > 0
      ? 'warning'
      : 'ok';
  return { id: view.id, status, issues };
}

function listOrphans(rootDir: string, repo: CapabilityRepository): string[] {
  if (!existsSync(rootDir)) return [];
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !PROTECTED_DIRS.has(entry.name))
    .map((entry) => entry.name)
    .filter((name) => !repo.get(name));
}

export function scanCapabilitiesHealth(input: HealthScanInput): CapabilityHealthReport {
  const installed = input.repo.list();
  return {
    checkedAt: new Date().toISOString(),
    packs: installed.map((view) => scanPack(view, input, installed)),
    orphans: listOrphans(input.rootDir, input.repo),
  };
}

/** 清理：无数据库行的根目录 + 超过 24h 的 .staging / .backup 残留 */
export function cleanupCapabilityArtifacts(input: {
  repo: CapabilityRepository;
  rootDir: string;
}): CapabilityCleanupResult {
  const removed: string[] = [];
  const skipped: string[] = [];
  const remove = (name: string, path: string): void => {
    try {
      rmSync(path, { recursive: true, force: true });
      removed.push(name);
    } catch {
      skipped.push(name);
    }
  };

  for (const folder of PROTECTED_DIRS) {
    const dir = join(input.rootDir, folder);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (Date.now() - statSync(full).mtimeMs >= STALE_MS) {
        remove(`${folder}/${entry.name}`, full);
      }
    }
  }

  for (const orphan of listOrphans(input.rootDir, input.repo)) {
    remove(orphan, join(input.rootDir, orphan));
  }
  return { removed, skipped };
}
