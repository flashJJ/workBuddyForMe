import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSamplePack } from './samples';
import {
  buildFakeVrma,
  buildSignedSkillPack,
  buildTestPack,
  hashOf,
} from './capability-test-helpers';
import { createUpgradeTestContext } from './capability-upgrade-test-helpers';

type TestContext = ReturnType<typeof createUpgradeTestContext>;

function ed25519Key() {
  return generateKeyPairSync('ed25519').privateKey;
}

function skillPack(id: string, name: string, version: string, deps: { id: string; version: string }[] = []) {
  const skill = JSON.stringify({ name, description: `${name} ${version}` });
  return buildTestPack(
    {
      id,
      version,
      kind: 'skill',
      name: `${name} 包`,
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: deps,
      checksums: { 'payload/skill.json': hashOf(skill) },
    },
    { 'payload/skill.json': skill },
  );
}

function mcpPack(): Uint8Array {
  const server = JSON.stringify({ name: 'health-mcp', transport: 'stdio', command: 'node' });
  return buildTestPack(
    {
      id: 'com.test.health.mcp',
      version: '1.0.0',
      kind: 'mcp',
      name: '健康 MCP',
      permissions: ['mcp:connect'],
      entry: 'payload/server.json',
      dependencies: [],
      checksums: { 'payload/server.json': hashOf(server) },
    },
    { 'payload/server.json': server },
  );
}

function findHealth(report: ReturnType<TestContext['service']['health']>, id: string) {
  return report.packs.find((item) => item.id === id)!;
}

describe('v2.12 能力包健康自检', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createUpgradeTestContext();
  });
  afterEach(() => ctx.close());

  it('六类健康包：全部 ok，孤儿目录为空', () => {
    const installed = [
      ctx.service.install(buildSamplePack('skill')),
      ctx.service.install(mcpPack()),
      ctx.service.install(buildSamplePack('workflow')),
      ctx.service.install(buildSamplePack('pet-action', { motionAsset: buildFakeVrma() })),
      ctx.service.install(buildSamplePack('event-script')),
      ctx.service.install(buildSamplePack('report-widget')),
    ];
    const report = ctx.service.health();
    for (const pack of installed) {
      expect(findHealth(report, pack.id).status).toBe('ok');
    }
    expect(report.orphans).toEqual([]);
  });

  it('六类 effect 缺失/状态不符都能定位到具体 kind', () => {
    const skill = ctx.service.install(buildSamplePack('skill'));
    const mcp = ctx.service.install(mcpPack());
    const workflow = ctx.service.install(buildSamplePack('workflow'));
    const pet = ctx.service.install(buildSamplePack('pet-action', { motionAsset: buildFakeVrma() }));
    const script = ctx.service.install(buildSamplePack('event-script'));
    const widget = ctx.service.install(buildSamplePack('report-widget'));

    rmSync(join(ctx.root, 'skills', skill.effectRef!), { recursive: true, force: true });
    ctx.removeMcpServer(mcp.effectRef!);
    ctx.workflows.setStatus(workflow.effectRef!, 'disabled');
    ctx.motions.delete(pet.effectRef!);
    ctx.eventScripts.setEnabled(script.effectRef!, false);
    ctx.reportWidgets.remove(widget.effectRef!);

    const report = ctx.service.health();
    expect(findHealth(report, skill.id).issues.map((item) => item.code)).toContain('effect_missing');
    expect(findHealth(report, mcp.id).issues.map((item) => item.code)).toContain('effect_missing');
    expect(findHealth(report, workflow.id).issues.map((item) => item.code)).toContain(
      'effect_status_mismatch',
    );
    expect(findHealth(report, pet.id).issues.map((item) => item.code)).toContain('effect_missing');
    expect(findHealth(report, script.id).issues.map((item) => item.code)).toContain(
      'effect_status_mismatch',
    );
    expect(findHealth(report, widget.id).issues.map((item) => item.code)).toContain(
      'effect_missing',
    );
  });

  it('校验和篡改与多余 payload 文件分别报 error/warn', () => {
    const installed = ctx.service.install(buildSamplePack('skill'));
    const packDir = join(ctx.root, 'capabilities', installed.id);
    writeFileSync(join(packDir, 'payload', 'skill.json'), '{"name":"tampered"}');
    writeFileSync(join(packDir, 'payload', 'extra.txt'), 'extra');
    const health = findHealth(ctx.service.health(), installed.id);
    const codes = health.issues.map((item) => item.code);
    expect(codes).toContain('checksum_mismatch');
    expect(codes).toContain('payload_extra_file');
    expect(health.status).toBe('broken');
  });

  it('清单损坏报告 manifest_invalid', () => {
    const skill = ctx.service.install(buildSamplePack('skill'));
    ctx.db
      .prepare('UPDATE capability_packs SET manifest_json = ? WHERE id = ?')
      .run('{}', skill.id);
    expect(findHealth(ctx.service.health(), skill.id).issues.map((item) => item.code)).toContain(
      'manifest_invalid',
    );
  });

  it('签名被篡改报告 signature_invalid', () => {
    const skill = ctx.service.install(buildSamplePack('skill'));
    const row = ctx.db
      .prepare('SELECT manifest_json FROM capability_packs WHERE id = ?')
      .get(skill.id) as { manifest_json: string };
    const manifest = JSON.parse(row.manifest_json) as Record<string, unknown>;
    manifest.signature = 'AAAA';
    ctx.db
      .prepare('UPDATE capability_packs SET manifest_json = ? WHERE id = ?')
      .run(JSON.stringify(manifest), skill.id);
    expect(findHealth(ctx.service.health(), skill.id).issues.map((item) => item.code)).toContain(
      'signature_invalid',
    );
  });

  it('未知密钥报告 signature_untrusted（warn）', () => {
    const installed = ctx.service.install(buildSignedSkillPack(ed25519Key(), 'other-key'));
    const issue = findHealth(ctx.service.health(), installed.id).issues.find(
      (item) => item.code === 'signature_untrusted',
    );
    expect(issue?.severity).toBe('warn');
  });

  it('依赖缺失、停用、版本不符分级正确', () => {
    const dep = ctx.service.install(skillPack('com.test.health.dep', 'health-dep', '1.0.0'));
    const child = ctx.service.install(
      skillPack('com.test.health.child', 'health-child', '1.0.0', [
        { id: 'com.test.health.dep', version: '1.0.0' },
      ]),
    );
    ctx.service.disable(dep.id);
    const disabledDep = findHealth(ctx.service.health(), child.id).issues;
    expect(disabledDep.find((item) => item.code === 'dependency_disabled')?.severity).toBe('warn');

    ctx.service.disable(child.id);
    ctx.service.upgrade(dep.id, skillPack('com.test.health.dep', 'health-dep', '2.0.0'));
    const mismatch = findHealth(ctx.service.health(), child.id).issues;
    expect(mismatch.find((item) => item.code === 'dependency_version_mismatch')?.severity).toBe(
      'error',
    );

    ctx.service.uninstall(dep.id);
    const missing = findHealth(ctx.service.health(), child.id).issues;
    expect(missing.find((item) => item.code === 'dependency_missing')?.severity).toBe('error');
  });
});
