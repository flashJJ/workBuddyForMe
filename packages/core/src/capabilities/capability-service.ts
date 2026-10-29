import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDataDir } from '@wbfm/config';
import { createCapabilityRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityView } from '@wbfm/shared/schemas';
import type { McpRegistry } from '../mcp/registry';
import type { SkillService } from '../skills/skill-service';
import { buildSampleSkillPack, parseCapabilityZip } from './manifest';
import {
  disableCapabilityEffect,
  enableCapabilityEffect,
  type CapabilityEffectDeps,
} from './capability-effects';

/**
 * v2.10 能力包服务：安装（校验+落盘）、启停（effect 注册/撤销）、卸载（清理磁盘与记录）。
 * fail-closed：任一步失败都不留下半启用状态；依赖/冲突在安装前拒绝。
 */

export interface CapabilityServiceDeps {
  db: DatabaseInstance;
  skills: SkillService;
  mcp: McpRegistry;
  /** 测试注入：能力包根目录（默认 <dataDir>/capabilities） */
  rootDir?: string;
  /** 测试注入：技能目录（默认 <dataDir>/skills） */
  skillsDir?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCapabilityService(deps: CapabilityServiceDeps) {
  const repo = createCapabilityRepository(deps.db);
  const rootDir = deps.rootDir ?? getDataDir('capabilities');
  const skillsDir = deps.skillsDir ?? getDataDir('skills');
  const effects: CapabilityEffectDeps = { skills: deps.skills, mcp: deps.mcp, skillsDir };

  const packDir = (id: string): string => join(rootDir, id);

  return {
    list(): CapabilityView[] {
      return repo.list();
    },

    /** 安装 ZIP：校验清单/校验和/权限/依赖 → 落盘 → 建行 → 自动启用（失败回滚） */
    install(buffer: Uint8Array): CapabilityView {
      const parsed = parseCapabilityZip(buffer);
      const { manifest, files } = parsed;
      const existing = repo.get(manifest.id);
      if (existing) throw ApiError.conflict(`能力包已安装：${manifest.id}`);

      const installed = repo.listEnabled();
      for (const dependency of manifest.dependencies) {
        const hit = installed.find((item) => item.id === dependency.id);
        if (!hit) throw ApiError.validation(`缺少依赖能力包：${dependency.id}`);
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
      if (capability.status === 'enabled') return capability;
      const manifest = repo.getManifest(id);
      if (!manifest) throw ApiError.validation('能力包清单损坏，请重新安装');
      const dir = packDir(id);
      if (!existsSync(dir)) throw ApiError.validation('能力包文件缺失，请重新安装');

      try {
        const effectRef = enableCapabilityEffect(manifest, dir, effects);
        return repo.update(id, {
          status: 'enabled',
          effectRef,
          lastError: null,
        })!;
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
      if (capability.status === 'disabled') return capability;
      const manifest = repo.getManifest(id);
      try {
        if (manifest && capability.effectRef) {
          disableCapabilityEffect(manifest, capability.effectRef, effects);
        }
      } catch (error) {
        repo.update(id, { lastError: errorMessage(error) });
        throw ApiError.validation(`能力包停用失败：${errorMessage(error)}`);
      }
      return repo.update(id, {
        status: 'disabled',
        effectRef: null,
        lastError: null,
      })!;
    },

    uninstall(id: string): void {
      const capability = repo.get(id);
      if (!capability) throw ApiError.notFound('能力包', id);
      const dependents = repo
        .listEnabled()
        .filter((item) => item.id !== id && item.manifest?.dependencies.some((dep) => dep.id === id));
      if (dependents.length > 0) {
        throw ApiError.conflict(
          `仍有能力包依赖它：${dependents.map((item) => item.id).join(', ')}`,
        );
      }
      if (capability.status === 'enabled') this.disable(id);
      rmSync(packDir(id), { recursive: true, force: true });
      repo.remove(id);
    },

    sample(): Uint8Array {
      return buildSampleSkillPack();
    },
  };
}

export type CapabilityService = ReturnType<typeof createCapabilityService>;
