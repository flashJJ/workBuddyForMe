import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDataDir } from '@wbfm/config';
import { createCapabilityRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type {
  CapabilityKind,
  CapabilityManifest,
  CapabilitySignaturePolicy,
  CapabilityTrustedKey,
  CapabilityView,
  CapabilityHealthReport,
  CapabilityCleanupResult,
} from '@wbfm/shared/schemas';
import type { AppSettings } from '@wbfm/shared/types';
import type {
  InstalledEventScriptRepository,
  ReportWidgetRepository,
  WorkflowRepository,
} from '@wbfm/database';
import type { McpRegistry } from '../mcp/registry';
import type { SkillService } from '../skills/skill-service';
import type { MotionService } from '../services/motion-service';
import { buildSamplePack } from './samples';
import { parseCapabilityZip } from './manifest';
import {
  assertCapabilitySignatureAllowed,
  verifyCapabilitySignature,
} from './signature';
import {
  disableCapabilityEffect,
  enableCapabilityEffect,
  uninstallCapabilityEffect,
  type CapabilityEffectDeps,
} from './effects';
import {
  upgradeCapability,
  type CapabilityUpgradeResult,
} from './upgrade';
import { assertDependencies } from './upgrade-preflight';
import {
  cleanupCapabilityArtifacts,
  scanCapabilitiesHealth,
} from './health';

/**
 * v2.10 能力包服务：安装（校验+落盘）、启停（effect 注册/撤销）、卸载（清理磁盘与记录）。
 * fail-closed：任一步失败都不留下半启用状态；依赖/冲突在安装前拒绝。
 */

export interface CapabilityServiceDeps {
  db: DatabaseInstance;
  skills: SkillService;
  mcp: McpRegistry;
  /** v2.11：workflow effect 使用 */
  workflows: WorkflowRepository;
  /** v2.11：pet-action effect 使用 */
  motions: MotionService;
  /** v2.11：event-script / report-widget effect 使用 */
  eventScripts: InstalledEventScriptRepository;
  reportWidgets: ReportWidgetRepository;
  /** v2.12：签名策略与信任库（按请求实时读取 settings，不做进程内缓存） */
  settings: {
    get(): Pick<AppSettings, 'capabilitySignaturePolicy' | 'capabilityTrustedKeys'>;
  };
  /** 测试注入：能力包根目录（默认 <dataDir>/capabilities） */
  rootDir?: string;
  /** 测试注入：技能目录（默认 <dataDir>/skills） */
  skillsDir?: string;
  /** v2.11：示例动作素材读取器（缺失时示例包返回 422） */
  sampleMotionAsset?: () => Uint8Array | null;
}

interface SignatureContext {
  policy: CapabilitySignaturePolicy;
  keys: CapabilityTrustedKey[];
}

function signatureContext(deps: CapabilityServiceDeps): SignatureContext {
  const settings = deps.settings.get();
  return {
    policy: settings.capabilitySignaturePolicy ?? 'warn',
    keys: settings.capabilityTrustedKeys ?? [],
  };
}

/** 安装/启用入口的 fail-closed 签名裁决（off 跳过计算） */
function assertManifestSignature(manifest: CapabilityManifest, context: SignatureContext): void {
  if (context.policy === 'off') return;
  assertCapabilitySignatureAllowed(
    verifyCapabilitySignature(manifest, context.keys),
    context.policy,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCapabilityService(deps: CapabilityServiceDeps) {
  const repo = createCapabilityRepository(deps.db);
  const rootDir = deps.rootDir ?? getDataDir('capabilities');
  const skillsDir = deps.skillsDir ?? getDataDir('skills');
  const effects: CapabilityEffectDeps = {
    skills: deps.skills,
    mcp: deps.mcp,
    skillsDir,
    workflows: deps.workflows,
    motions: deps.motions,
    eventScripts: deps.eventScripts,
    reportWidgets: deps.reportWidgets,
  };

  const packDir = (id: string): string => join(rootDir, id);

  /** v2.12：给视图补签名徽章；off 策略显示「未校验」 */
  const annotate = (
    view: CapabilityView,
    context: SignatureContext,
    manifest: CapabilityManifest | null,
  ): CapabilityView => {
    if (context.policy === 'off') return { ...view, signatureStatus: 'unchecked' };
    if (!manifest) return view;
    return {
      ...view,
      signatureStatus: verifyCapabilitySignature(manifest, context.keys).status,
    };
  };

  return {
    list(): CapabilityView[] {
      const context = signatureContext(deps);
      return repo
        .list()
        .map((view) => annotate(view, context, repo.getManifest(view.id)));
    },

    /** 安装 ZIP：校验清单/校验和/签名/权限/依赖 → 落盘 → 建行 → 自动启用（失败回滚） */
    install(buffer: Uint8Array): CapabilityView {
      const parsed = parseCapabilityZip(buffer);
      const { manifest, files } = parsed;
      assertManifestSignature(manifest, signatureContext(deps));
      const existing = repo.get(manifest.id);
      if (existing) throw ApiError.conflict(`能力包已安装：${manifest.id}`);

      const installed = repo.list();
      for (const dependency of manifest.dependencies) {
        const hit = installed.find((item) => item.id === dependency.id);
        if (!hit) throw ApiError.validation(`依赖未安装：${dependency.id}`);
        if (hit.status !== 'enabled') throw ApiError.validation(`依赖未启用：${dependency.id}`);
        if (dependency.version && hit.version !== dependency.version) {
          throw ApiError.validation(
            `依赖版本不匹配：${dependency.id} 需要 ${dependency.version}，已安装 ${hit.version}`,
          );
        }
      }

      const dir = packDir(manifest.id);
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      for (const [path, bytes] of Object.entries(files)) {
        const target = join(dir, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      }
      repo.create({ manifest, status: 'disabled' });
      try {
        return this.enable(manifest.id);
      } catch (error) {
        rmSync(dir, { recursive: true, force: true });
        repo.remove(manifest.id);
        throw error;
      }
    },

    enable(id: string): CapabilityView {
      const capability = repo.get(id);
      if (!capability) throw ApiError.notFound('能力包', id);
      const context = signatureContext(deps);
      const manifest = repo.getManifest(id);
      if (capability.status === 'enabled') {
        return annotate(capability, context, manifest);
      }
      if (!manifest) throw ApiError.validation('能力包清单损坏，请重新安装');
      const dir = packDir(id);
      if (!existsSync(dir)) throw ApiError.validation('能力包文件缺失，请重新安装');
      assertManifestSignature(manifest, context);
      assertDependencies(repo, manifest);

      try {
        const effectRef = enableCapabilityEffect(manifest, dir, effects);
        return annotate(
          repo.update(id, {
            status: 'enabled',
            effectRef,
            lastError: null,
          })!,
          context,
          manifest,
        );
      } catch (error) {
        repo.update(id, {
          status: 'disabled',
          effectRef: null,
          lastError: errorMessage(error),
        });
        throw error instanceof ApiError
          ? error
          : ApiError.validation(`能力包启用失败：${errorMessage(error)}`);
      }
    },

    disable(id: string): CapabilityView {
      const capability = repo.get(id);
      if (!capability) throw ApiError.notFound('能力包', id);
      const context = signatureContext(deps);
      const manifest = repo.getManifest(id);
      if (capability.status === 'disabled') return annotate(capability, context, manifest);
      try {
        if (manifest && capability.effectRef) {
          disableCapabilityEffect(manifest, capability.effectRef, effects);
        }
      } catch (error) {
        repo.update(id, { lastError: errorMessage(error) });
        throw ApiError.validation(`能力包停用失败：${errorMessage(error)}`);
      }
      return annotate(
        repo.update(id, {
          status: 'disabled',
          effectRef: null,
          lastError: null,
        })!,
        context,
        manifest,
      );
    },

    uninstall(id: string): void {
      const capability = repo.get(id);
      if (!capability) throw ApiError.notFound('能力包', id);
      const manifest = repo.getManifest(id);
      const effectRef = capability.effectRef;
      const dependents = repo
        .listEnabled()
        .filter((item) => item.id !== id && item.manifest?.dependencies.some((dep) => dep.id === id));
      if (dependents.length > 0) {
        throw ApiError.conflict(
          `仍有能力包依赖它：${dependents.map((item) => item.id).join(', ')}`,
        );
      }
      if (capability.status === 'enabled') this.disable(id);
      if (manifest) uninstallCapabilityEffect(manifest, effectRef, effects);
      rmSync(packDir(id), { recursive: true, force: true });
      repo.remove(id);
    },

    upgrade(
      id: string,
      buffer: Uint8Array,
      options: { confirmDowngrade?: boolean; expectedVersion?: string; repair?: boolean } = {},
    ): CapabilityUpgradeResult {
      return upgradeCapability({
        id,
        buffer,
        repo,
        effects,
        rootDir,
        ...options,
        hooks: {
          assertSignature: (manifest) =>
            assertManifestSignature(manifest, signatureContext(deps)),
          annotate: (view, manifest) => annotate(view, signatureContext(deps), manifest),
        },
      });
    },

    /** v2.12 M3：按需健康自检（始终验签，不受安装策略影响） */
    health(): CapabilityHealthReport {
      return scanCapabilitiesHealth({
        repo,
        effects,
        rootDir,
        trustedKeys: signatureContext(deps).keys,
      });
    },

    /** v2.12 M3：清理无主目录 + 超过 24h 的升级残留 */
    cleanupArtifacts(): CapabilityCleanupResult {
      return cleanupCapabilityArtifacts({ repo, rootDir });
    },

    sample(kind: CapabilityKind = 'skill'): Uint8Array {
      return buildSamplePack(kind, {
        motionAsset: deps.sampleMotionAsset?.() ?? undefined,
      });
    },
  };
}

export type CapabilityService = ReturnType<typeof createCapabilityService>;
