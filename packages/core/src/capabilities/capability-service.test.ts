import { createHash as hash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { McpRegistry } from '../mcp/registry';
import { createMotionService } from '../services/motion-service';
import { createSkillService } from '../skills/skill-service';
import { createCapabilityService } from './capability-service';
import { buildSamplePack, buildSampleSkillPack } from './manifest';

function pack(manifest: Record<string, unknown>, files: Record<string, string>): Uint8Array {
  const zipFiles: Record<string, Uint8Array> = {
    'wbfm-capability.json': strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const [path, content] of Object.entries(files)) zipFiles[path] = strToU8(content);
  return zipSync(zipFiles);
}

function mcpPack(): Uint8Array {
  const server = JSON.stringify({
    name: 'pack-mcp',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  });
  const hash = createHash(server);
  return pack(
    {
      id: 'com.test.mcp',
      version: '1.0.0',
      kind: 'mcp',
      name: '测试 MCP',
      description: '测试用 MCP 服务器',
      permissions: ['mcp:connect'],
      entry: 'payload/server.json',
      dependencies: [],
      checksums: { 'payload/server.json': hash },
    },
    { 'payload/server.json': server },
  );
}

function createHash(content: string): string {
  return hash('sha256').update(content).digest('hex');
}

describe('v2.10 能力包服务', () => {
  let db: DatabaseInstance;
  let root: string;
  let skillsDir: string;
  let skills: ReturnType<typeof createSkillService>;
  let mcp: McpRegistry;
  let workflows: ReturnType<typeof createWorkflowRepository>;
  let motions: ReturnType<typeof createMotionService>;
  let service: ReturnType<typeof createCapabilityService>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-cap-'));
    setDataRootForTest(root);
    db = createDatabase();
    skillsDir = join(root, 'skills');
    skills = createSkillService({ db }, { skillsDir, seedBuiltins: false });
    const createServer = vi.fn(() => ({ id: 'server-1' })) as unknown as McpRegistry['createServer'];
    const removeServer = vi.fn() as unknown as McpRegistry['removeServer'];
    mcp = { createServer, removeServer } as unknown as McpRegistry;
    workflows = createWorkflowRepository(db);
    motions = createMotionService(db);
    service = createCapabilityService({
      db,
      skills,
      mcp,
      workflows,
      motions,
      rootDir: join(root, 'capabilities'),
      skillsDir,
      sampleMotionAsset: () => buildFakeVrma(),
    });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('示例技能包：安装即启用，技能出现；停用/卸载后效果消失', () => {
    const installed = service.install(buildSampleSkillPack());
    expect(installed.status).toBe('enabled');
    expect(installed.effectRef).toBe('capability-demo');
    expect(skills.list().some((item) => item.name === 'capability-demo')).toBe(true);
    expect(skills.getEnabledSkills().map((item) => item.name)).toContain('capability-demo');

    const disabled = service.disable(installed.id);
    expect(disabled.status).toBe('disabled');
    expect(skills.list().some((item) => item.name === 'capability-demo')).toBe(false);

    const enabled = service.enable(installed.id);
    expect(enabled.status).toBe('enabled');
    expect(skills.list().some((item) => item.name === 'capability-demo')).toBe(true);

    service.uninstall(installed.id);
    expect(service.list()).toEqual([]);
    expect(skills.list().some((item) => item.name === 'capability-demo')).toBe(false);
  });

  it('MCP 包：启用创建服务器，停用移除服务器', () => {
    const installed = service.install(mcpPack());
    expect(installed.effectRef).toBe('server-1');
    expect(mcp.createServer).toHaveBeenCalledTimes(1);

    service.disable(installed.id);
    expect(mcp.removeServer).toHaveBeenCalledWith('server-1');
    expect(service.list()[0]!.status).toBe('disabled');
  });

  it('校验和/权限/依赖/重复安装 fail-closed', () => {
    expect(() => service.install(pack({
      id: 'com.test.badsum',
      version: '1.0.0',
      kind: 'skill',
      name: '坏校验和',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [],
      checksums: { 'payload/skill.json': 'a'.repeat(64) },
    }, { 'payload/skill.json': '{}' }))).toThrow(/校验和不匹配/);

    expect(() => service.install(pack({
      id: 'com.test.noperm',
      version: '1.0.0',
      kind: 'skill',
      name: '缺权限',
      permissions: [],
      entry: 'payload/skill.json',
      dependencies: [],
      checksums: { 'payload/skill.json': createHash('{}') },
    }, { 'payload/skill.json': '{}' }))).toThrow(/缺少必需权限/);

    expect(() => service.install(pack({
      id: 'com.test.dep',
      version: '1.0.0',
      kind: 'skill',
      name: '缺依赖',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [{ id: 'com.base' }],
      checksums: { 'payload/skill.json': createHash('{}') },
    }, { 'payload/skill.json': '{}' }))).toThrow(/缺少依赖/);

    expect(() => service.install(pack({
      id: 'com.test.script',
      version: '1.0.0',
      kind: 'event-script',
      name: '未接入类型',
      permissions: ['events:write'],
      entry: 'payload/script.json',
      dependencies: [],
      checksums: { 'payload/script.json': 'a'.repeat(64) },
    }, { 'payload/script.json': '{}' }))).toThrow(/尚未接入/);

    const sample = buildSampleSkillPack();
    service.install(sample);
    expect(() => service.install(sample)).toThrow(/已安装/);
  });

  it('工作流示例包：安装即发布，停用保留行，再启用复用，卸载删除', () => {
    const installed = service.install(buildSamplePack('workflow'));
    expect(installed.status).toBe('enabled');
    const workflow = workflows.getWorkflow(installed.effectRef!);
    expect(workflow?.status).toBe('published');
    expect(workflow?.originCapabilityId).toBe(installed.id);
    expect(workflows.getCurrentVersion(installed.effectRef!)?.graph.nodes.length).toBeGreaterThan(0);

    const disabled = service.disable(installed.id);
    expect(disabled.status).toBe('disabled');
    expect(workflows.getWorkflow(installed.effectRef!)?.status).toBe('disabled');

    const enabled = service.enable(installed.id);
    expect(enabled.status).toBe('enabled');
    expect(enabled.effectRef).toBe(installed.effectRef);
    expect(workflows.listWorkflows()).toHaveLength(1);

    service.uninstall(installed.id);
    expect(service.list()).toEqual([]);
    expect(workflows.getWorkflow(installed.effectRef!)).toBeNull();
  });

  it('工作流有运行记录：卸载保留禁用行并标注来源包', () => {
    const installed = service.install(buildSamplePack('workflow'));
    db.prepare(
      'INSERT INTO workflow_runs(id, workflow_id, version, created_at) VALUES (?,?,?,?)',
    ).run('run-1', installed.effectRef!, 1, new Date().toISOString());

    service.uninstall(installed.id);
    expect(service.list()).toEqual([]);
    const workflow = workflows.getWorkflow(installed.effectRef!);
    expect(workflow?.status).toBe('disabled');
    expect(workflow?.originCapabilityId).toBe(installed.id);
  });

  it('动作示例包：安装进动作池，停用/卸载移除', () => {
    const installed = service.install(
      buildSamplePack('pet-action', { motionAsset: buildFakeVrma() }),
    );
    expect(installed.status).toBe('enabled');
    expect(motions.list().some((item) => item.id === installed.effectRef)).toBe(true);

    service.disable(installed.id);
    expect(motions.list()).toHaveLength(0);

    const enabled = service.enable(installed.id);
    expect(enabled.status).toBe('enabled');
    expect(motions.list()).toHaveLength(1);

    service.uninstall(installed.id);
    expect(service.list()).toEqual([]);
    expect(motions.list()).toHaveLength(0);
  });

  it('示例包：未接入的类型不伪造可用示例', () => {
    expect(() => service.sample('event-script')).toThrow(/示例尚未提供/);
    expect(() => service.sample('report-widget')).toThrow(/示例尚未提供/);
  });
});

function buildFakeVrma(): Uint8Array {
  return buildFakeGlb({
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: { specVersion: '1.0' } },
  });
}

function buildFakeGlb(extra: { extensionsUsed?: string[]; extensions?: unknown }): Uint8Array {
  const json = JSON.stringify({ asset: { version: '2.0' }, ...extra });
  const jsonBytes = new TextEncoder().encode(json);
  const total = 20 + jsonBytes.length;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf).set(jsonBytes, 20);
  return new Uint8Array(buf);
}
