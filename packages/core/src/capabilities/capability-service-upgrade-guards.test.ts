import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@wbfm/shared/errors';
import { buildTestPack, hashOf } from './capability-test-helpers';
import { createUpgradeTestContext } from './capability-upgrade-test-helpers';
import { compareCapabilityVersions } from './upgrade';

type TestContext = ReturnType<typeof createUpgradeTestContext>;

function catchError(fn: () => unknown): ApiError | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error as ApiError;
  }
}

function skillPack(version: string, description = '技能'): Uint8Array {
  const skill = JSON.stringify({ name: 'guard-skill', description });
  return buildTestPack(
    {
      id: 'com.test.guard.skill',
      version,
      kind: 'skill',
      name: '守卫技能',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [],
      checksums: { 'payload/skill.json': hashOf(skill) },
    },
    { 'payload/skill.json': skill },
  );
}

function childPack(depVersion: string): Uint8Array {
  const skill = JSON.stringify({ name: 'guard-child', description: '依赖守卫技能' });
  return buildTestPack(
    {
      id: 'com.test.guard.child',
      version: '1.0.0',
      kind: 'skill',
      name: '从属技能',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [{ id: 'com.test.guard.skill', version: depVersion }],
      checksums: { 'payload/skill.json': hashOf(skill) },
    },
    { 'payload/skill.json': skill },
  );
}

function mcpPack(version: string): Uint8Array {
  const server = JSON.stringify({ name: 'guard-mcp', transport: 'stdio', command: 'node' });
  return buildTestPack(
    {
      id: 'com.test.guard.mcp',
      version,
      kind: 'mcp',
      name: '守卫 MCP',
      permissions: ['mcp:connect'],
      entry: 'payload/server.json',
      dependencies: [],
      checksums: { 'payload/server.json': hashOf(server) },
    },
    { 'payload/server.json': server },
  );
}

describe('v2.12 能力包升级守卫与回滚', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createUpgradeTestContext();
  });
  afterEach(() => ctx.close());

  it('版本比较：三段归一化、非法格式拒绝', () => {
    expect(compareCapabilityVersions('2', '1.0.9')).toBe(1);
    expect(compareCapabilityVersions('1.0', '1.0.0')).toBe(0);
    expect(compareCapabilityVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareCapabilityVersions('1.0.0.1', '1.0.0')).toBeNull();
    expect(compareCapabilityVersions('v2.0', '1.0.0')).toBeNull();
  });

  it('同版本、降级、非法版本、id 不符均拒绝', () => {
    const installed = ctx.service.install(skillPack('1.0.0'));
    const sameVersion = catchError(() => ctx.service.upgrade(installed.id, skillPack('1.0.0')));
    expect(sameVersion).toMatchObject({ code: 'CAPABILITY_VERSION_NOT_NEWER', status: 422 });
    expect((sameVersion?.details as { repairAvailable?: boolean }).repairAvailable).toBe(false);

    const downgrade = catchError(() =>
      ctx.service.upgrade(installed.id, skillPack('0.9.0', '旧内容')),
    );
    expect(downgrade).toMatchObject({ code: 'CAPABILITY_DOWNGRADE_CONFIRM_REQUIRED', status: 422 });
    expect(downgrade?.details).toMatchObject({ targetVersion: '0.9.0' });

    expect(() => ctx.service.upgrade(installed.id, skillPack('v2.0'))).toThrow(/版本格式非法/);

    const otherId = buildTestPack(
      {
        id: 'com.test.guard.other',
        version: '2.0.0',
        kind: 'skill',
        name: '别的包',
        permissions: ['skill:install'],
        entry: 'payload/skill.json',
        dependencies: [],
        checksums: { 'payload/skill.json': hashOf(JSON.stringify({ name: 'other', description: 'x' })) },
      },
      { 'payload/skill.json': JSON.stringify({ name: 'other', description: 'x' }) },
    );
    expect(() => ctx.service.upgrade(installed.id, otherId)).toThrow(/清单 id 与目标不一致/);
  });

  it('降级需确认且目标版本一致；确认后成功并标记 direction', () => {
    const installed = ctx.service.install(skillPack('2.0.0', 'v2 内容'));
    expect(installed.version).toBe('2.0.0');

    const mismatch = catchError(() =>
      ctx.service.upgrade(installed.id, skillPack('1.0.0', '旧内容'), {
        confirmDowngrade: true,
        expectedVersion: '2.0.0',
      }),
    );
    expect(mismatch).toMatchObject({ code: 'CAPABILITY_DOWNGRADE_TARGET_MISMATCH', status: 422 });

    const after = ctx.service.upgrade(installed.id, skillPack('1.0.0', '旧内容'), {
      confirmDowngrade: true,
      expectedVersion: '1.0.0',
    });
    expect(after.upgrade.direction).toBe('downgrade');
    expect(after.capability.version).toBe('1.0.0');
  });

  it('同版本内容变化：repair=true 修复安装，内容一致时拒绝', () => {
    const installed = ctx.service.install(skillPack('1.0.0', '旧内容'));
    const probe = catchError(() => ctx.service.upgrade(installed.id, skillPack('1.0.0', '新内容')));
    expect(probe).toMatchObject({ code: 'CAPABILITY_VERSION_NOT_NEWER', status: 422 });
    expect((probe?.details as { repairAvailable?: boolean }).repairAvailable).toBe(true);

    const repaired = ctx.service.upgrade(installed.id, skillPack('1.0.0', '新内容'), {
      repair: true,
    });
    expect(repaired.upgrade.direction).toBe('repair');
    expect(ctx.skills.list().find((item) => item.name === 'guard-skill')?.manifest?.description).toBe(
      '新内容',
    );
    const installedManifest = ctx.service.list().find((item) => item.id === installed.id);
    expect(installedManifest?.version).toBe('1.0.0');

    const identical = catchError(() =>
      ctx.service.upgrade(installed.id, skillPack('1.0.0', '新内容'), { repair: true }),
    );
    expect(identical).toMatchObject({ code: 'CAPABILITY_VERSION_NOT_NEWER' });
  });

  it('启用中的从属包声明旧版本：升级 409 并返回依赖方 id', () => {
    const installed = ctx.service.install(skillPack('1.0.0'));
    const child = ctx.service.install(childPack('1.0.0'));
    const error = catchError(() => ctx.service.upgrade(installed.id, skillPack('2.0.0')));
    expect(error).toMatchObject({ code: 'CAPABILITY_DEPENDENTS_ACTIVE', status: 409 });
    expect((error?.details as { dependents?: string[] }).dependents).toEqual([child.id]);
    expect(ctx.service.list().find((item) => item.id === installed.id)?.version).toBe('1.0.0');
  });

  it('降级遇到启用中的反向依赖：409 拒绝且不自动禁用依赖方', () => {
    const parent = ctx.service.install(skillPack('2.0.0', 'v2 内容'));
    const child = ctx.service.install(childPack('2.0.0'));
    const error = catchError(() =>
      ctx.service.upgrade(parent.id, skillPack('1.0.0', '旧内容'), {
        confirmDowngrade: true,
        expectedVersion: '1.0.0',
      }),
    );
    expect(error).toMatchObject({ code: 'CAPABILITY_DEPENDENTS_ACTIVE', status: 409 });
    expect((error?.details as { dependents?: string[] }).dependents).toEqual([child.id]);
    expect(ctx.service.list().find((item) => item.id === child.id)?.status).toBe('enabled');
  });

  it('禁用从属包不阻塞升级，但响应列出受影响包', () => {
    const installed = ctx.service.install(skillPack('1.0.0'));
    const child = ctx.service.install(childPack('1.0.0'));
    ctx.service.disable(child.id);
    const after = ctx.service.upgrade(installed.id, skillPack('2.0.0'));
    expect(after.upgrade.affectedDisabledDependents).toEqual([child.id]);
    expect(after.capability.version).toBe('2.0.0');
  });

  it('新版本启用失败：恢复旧包、旧版本与可用状态', () => {
    const installed = ctx.service.install(mcpPack('1.0.0'));
    expect(installed.effectRef).toBe('server-1');
    ctx.failNextCreate();
    expect(() => ctx.service.upgrade(installed.id, mcpPack('2.0.0'))).toThrow(/已回滚到旧版本/);

    const row = ctx.service.list().find((item) => item.id === installed.id)!;
    expect(row.version).toBe('1.0.0');
    expect(row.status).toBe('enabled');
    expect(row.effectRef).toBe('server-2');
    const backup = join(ctx.root, 'capabilities', '.backup');
    expect(existsSync(backup) ? readdirSync(backup).length : 0).toBe(0);

    const retried = ctx.service.upgrade(installed.id, mcpPack('2.0.0'));
    expect(retried.capability.version).toBe('2.0.0');
  });

  it('require 策略下未签名升级 422', () => {
    const installed = ctx.service.install(skillPack('1.0.0'));
    ctx.signature.capabilitySignaturePolicy = 'require';
    expect(() => ctx.service.upgrade(installed.id, skillPack('2.0.0'))).toThrow(/有效签名/);
    expect(ctx.service.list().find((item) => item.id === installed.id)?.version).toBe('1.0.0');
  });
});
