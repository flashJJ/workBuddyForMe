import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityTrustedKey } from '@wbfm/shared/schemas';
import {
  createDatabase,
  createInstalledEventScriptRepository,
  createReportWidgetRepository,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { McpRegistry } from '../mcp/registry';
import { createMotionService } from '../services/motion-service';
import { createSkillService } from '../skills/skill-service';
import { createCapabilityService } from './capability-service';
import {
  buildFakeVrma,
  buildTestMcpPack,
  buildTestPack,
  hashOf,
} from './capability-test-helpers';
import { buildSamplePack, buildSampleSkillPack } from './samples';

describe('v2.10 能力包服务', () => {
  let db: DatabaseInstance;
  let root: string;
  let skillsDir: string;
  let skills: ReturnType<typeof createSkillService>;
  let mcp: McpRegistry;
  let workflows: ReturnType<typeof createWorkflowRepository>;
  let motions: ReturnType<typeof createMotionService>;
  let eventScripts: ReturnType<typeof createInstalledEventScriptRepository>;
  let reportWidgets: ReturnType<typeof createReportWidgetRepository>;
  let service: ReturnType<typeof createCapabilityService>;
  let signatureSettings: {
    capabilitySignaturePolicy: 'off' | 'warn' | 'require';
    capabilityTrustedKeys: CapabilityTrustedKey[];
  };

  beforeEach(() => {
    signatureSettings = { capabilitySignaturePolicy: 'warn', capabilityTrustedKeys: [] };
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
    eventScripts = createInstalledEventScriptRepository(db);
    reportWidgets = createReportWidgetRepository(db);
    service = createCapabilityService({
      db,
      skills,
      mcp,
      workflows,
      motions,
      eventScripts,
      reportWidgets,
      settings: { get: () => signatureSettings },
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
    const installed = service.install(buildTestMcpPack());
    expect(installed.effectRef).toBe('server-1');
    expect(mcp.createServer).toHaveBeenCalledTimes(1);

    service.disable(installed.id);
    expect(mcp.removeServer).toHaveBeenCalledWith('server-1');
    expect(service.list()[0]!.status).toBe('disabled');
  });

  it('校验和/权限/依赖/重复安装 fail-closed', () => {
    expect(() => service.install(buildTestPack({
      id: 'com.test.badsum',
      version: '1.0.0',
      kind: 'skill',
      name: '坏校验和',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [],
      checksums: { 'payload/skill.json': 'a'.repeat(64) },
    }, { 'payload/skill.json': '{}' }))).toThrow(/校验和不匹配/);

    expect(() => service.install(buildTestPack({
      id: 'com.test.noperm',
      version: '1.0.0',
      kind: 'skill',
      name: '缺权限',
      permissions: [],
      entry: 'payload/skill.json',
      dependencies: [],
      checksums: { 'payload/skill.json': hashOf('{}') },
    }, { 'payload/skill.json': '{}' }))).toThrow(/缺少必需权限/);

    expect(() => service.install(buildTestPack({
      id: 'com.test.dep',
      version: '1.0.0',
      kind: 'skill',
      name: '缺依赖',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [{ id: 'com.base' }],
      checksums: { 'payload/skill.json': hashOf('{}') },
    }, { 'payload/skill.json': '{}' }))).toThrow(/依赖未安装/);

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

  it('示例包：mcp 模板安装被拒，其余类型可下载', () => {
    expect(() => service.sample('mcp')).not.toThrow();
    expect(() => service.install(service.sample('mcp'))).toThrow(/必须提供 url/);
    for (const kind of ['skill', 'workflow', 'pet-action', 'event-script', 'report-widget'] as const) {
      expect(service.sample(kind).byteLength).toBeGreaterThan(0);
    }
  });

  it('剧本示例包：安装启用，停用保留行，卸载删除', () => {
    const installed = service.install(buildSamplePack('event-script'));
    expect(installed.effectRef).toBe('usr.goodnight');
    expect(eventScripts.get('usr.goodnight')?.enabled).toBe(true);

    const disabled = service.disable(installed.id);
    expect(disabled.status).toBe('disabled');
    expect(eventScripts.get('usr.goodnight')?.enabled).toBe(false);

    service.enable(installed.id);
    expect(eventScripts.get('usr.goodnight')?.enabled).toBe(true);

    service.uninstall(installed.id);
    expect(eventScripts.get('usr.goodnight')).toBeNull();
  });

  it('报告卡片示例包：安装可查，停用/卸载移除', () => {
    const installed = service.install(buildSamplePack('report-widget'));
    expect(installed.effectRef).toBe('com.example.sample.report-widget');
    expect(reportWidgets.listEnabled().map((item) => item.id)).toContain(installed.effectRef);

    service.disable(installed.id);
    expect(reportWidgets.listEnabled()).toHaveLength(0);

    service.enable(installed.id);
    expect(reportWidgets.listEnabled()).toHaveLength(1);

    service.uninstall(installed.id);
    expect(reportWidgets.listEnabled()).toHaveLength(0);
  });

  it('剧本 id 跨包占用：重复安装 409 且不留新包', () => {
    service.install(buildSamplePack('event-script'));
    const script = JSON.stringify({
      definition: {
        id: 'usr.goodnight',
        title: '另一个晚安',
        priority: 1,
        interruptPolicy: 'ignore',
        cooldownMs: 3_600_000,
        maxPerDay: 2,
        speechLock: 'queue',
        steps: [
          { kind: 'expression', tag: 'joy' },
          { kind: 'speech', text: '晚安。' },
        ],
      },
      trigger: { kind: 'phrase', phrases: ['晚安'] },
    });
    const custom = buildTestPack(
      {
        id: 'com.test.script',
        version: '1.0.0',
        kind: 'event-script',
        name: '冲突剧本',
        description: '与示例剧本同 id',
        permissions: ['events:write'],
        entry: 'payload/script.json',
        dependencies: [],
        checksums: { 'payload/script.json': hashOf(script) },
      },
      { 'payload/script.json': script },
    );
    expect(() => service.install(custom)).toThrow(/已被其它能力包占用/);
    expect(service.list().map((item) => item.id)).toEqual(['com.example.sample.event-script']);
    expect(eventScripts.get('usr.goodnight')?.packId).toBe('com.example.sample.event-script');
  });
});
