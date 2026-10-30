import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestPack, hashOf } from './capability-test-helpers';
import { createUpgradeTestContext } from './capability-upgrade-test-helpers';
import { compareCapabilityVersions } from './upgrade';

type TestContext = ReturnType<typeof createUpgradeTestContext>;

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

  it('同版本、降级、非法版本、id 不符均 422', () => {
    const installed = ctx.service.install(skillPack('1.0.0'));
    expect(() => ctx.service.upgrade(installed.id, skillPack('1.0.0'))).toThrow(/严格递增/);
    expect(() => ctx.service.upgrade(installed.id, skillPack('0.9.0'))).toThrow(/严格递增/);
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

  it('启用中的从属包声明旧版本：升级 409', () => {
    const installed = ctx.service.install(skillPack('1.0.0'));
    ctx.service.install(childPack('1.0.0'));
    expect(() => ctx.service.upgrade(installed.id, skillPack('2.0.0'))).toThrow(/仍声明旧版本/);
    expect(ctx.service.list().find((item) => item.id === installed.id)?.version).toBe('1.0.0');
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
