import { existsSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSamplePack } from './samples';
import { createUpgradeTestContext } from './capability-upgrade-test-helpers';

type TestContext = ReturnType<typeof createUpgradeTestContext>;

const HOUR = 60 * 60 * 1000;

describe('v2.12 能力包健康清理', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createUpgradeTestContext();
  });
  afterEach(() => ctx.close());

  it('报告无主目录并排除 .staging / .backup', () => {
    mkdirSync(join(ctx.root, 'capabilities', 'ghost'), { recursive: true });
    mkdirSync(join(ctx.root, 'capabilities', '.staging', 'fresh'), { recursive: true });
    const report = ctx.service.health();
    expect(report.orphans).toEqual(['ghost']);
  });

  it('清理只删无行目录，保留安装包与新鲜升级残留', () => {
    const installed = ctx.service.install(buildSamplePack('skill'));
    mkdirSync(join(ctx.root, 'capabilities', 'ghost'), { recursive: true });
    mkdirSync(join(ctx.root, 'capabilities', '.staging', 'fresh'), { recursive: true });
    mkdirSync(join(ctx.root, 'capabilities', '.backup', 'fresh'), { recursive: true });
    const result = ctx.service.cleanupArtifacts();
    expect(result.removed).toContain('ghost');
    expect(result.skipped).toEqual([]);
    expect(existsSync(join(ctx.root, 'capabilities', installed.id))).toBe(true);
    expect(ctx.service.list()).toHaveLength(1);
    expect(ctx.service.health().orphans).toEqual([]);
  });

  it('超过 24h 的 .staging / .backup 被清理，新鲜目录保留', () => {
    const old = new Date(Date.now() - 25 * HOUR);
    const staleStaging = join(ctx.root, 'capabilities', '.staging', 'stale');
    const staleBackup = join(ctx.root, 'capabilities', '.backup', 'stale');
    mkdirSync(staleStaging, { recursive: true });
    mkdirSync(staleBackup, { recursive: true });
    utimesSync(staleStaging, old, old);
    utimesSync(staleBackup, old, old);
    mkdirSync(join(ctx.root, 'capabilities', '.staging', 'fresh'), { recursive: true });

    const result = ctx.service.cleanupArtifacts();
    expect(result.removed).toContain('.staging/stale');
    expect(result.removed).toContain('.backup/stale');
    expect(result.removed).not.toContain('.staging/fresh');
    expect(existsSync(join(ctx.root, 'capabilities', '.staging', 'fresh'))).toBe(true);
  });

  it('包目录被删后报告 pack_dir_missing', () => {
    const installed = ctx.service.install(buildSamplePack('skill'));
    rmSync(join(ctx.root, 'capabilities', installed.id), { recursive: true, force: true });
    const health = ctx.service.health().packs.find((item) => item.id === installed.id)!;
    expect(health.issues.map((item) => item.code)).toContain('pack_dir_missing');
    expect(health.status).toBe('broken');
  });
});
