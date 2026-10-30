import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSamplePack } from './samples';
import { buildFakeVrma, buildTestPack, hashOf } from './capability-test-helpers';
import { bumpPackVersion, createUpgradeTestContext } from './capability-upgrade-test-helpers';

type TestContext = ReturnType<typeof createUpgradeTestContext>;

function skillPack(version: string, description: string): Uint8Array {
  const skill = JSON.stringify({ name: 'up-skill', description });
  return buildTestPack(
    {
      id: 'com.test.up.skill',
      version,
      kind: 'skill',
      name: '升级技能',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [],
      checksums: { 'payload/skill.json': hashOf(skill) },
    },
    { 'payload/skill.json': skill },
  );
}

function mcpPack(version: string): Uint8Array {
  const server = JSON.stringify({ name: 'up-mcp', transport: 'stdio', command: 'node', args: ['x.js'] });
  return buildTestPack(
    {
      id: 'com.test.up.mcp',
      version,
      kind: 'mcp',
      name: '升级 MCP',
      permissions: ['mcp:connect'],
      entry: 'payload/server.json',
      dependencies: [],
      checksums: { 'payload/server.json': hashOf(server) },
    },
    { 'payload/server.json': server },
  );
}

function scriptPack(version: string, text: string): Uint8Array {
  const script = JSON.stringify({
    definition: {
      id: 'usr.upnight',
      title: `剧本 ${version}`,
      priority: 1,
      interruptPolicy: 'ignore',
      cooldownMs: 3_600_000,
      maxPerDay: 2,
      speechLock: 'queue',
      steps: [
        { kind: 'expression', tag: 'joy' },
        { kind: 'speech', text },
      ],
    },
    trigger: { kind: 'phrase', phrases: ['升级测试'] },
  });
  return buildTestPack(
    {
      id: 'com.test.up.script',
      version,
      kind: 'event-script',
      name: '升级剧本',
      permissions: ['events:write'],
      entry: 'payload/script.json',
      dependencies: [],
      checksums: { 'payload/script.json': hashOf(script) },
    },
    { 'payload/script.json': script },
  );
}

function widgetPack(version: string, title: string): Uint8Array {
  const widget = JSON.stringify({ title, chain: 'task', metric: 'run_count', windowDays: 7 });
  return buildTestPack(
    {
      id: 'com.test.up.widget',
      version,
      kind: 'report-widget',
      name: '升级卡片',
      permissions: ['report:widget'],
      entry: 'payload/widget.json',
      dependencies: [],
      checksums: { 'payload/widget.json': hashOf(widget) },
    },
    { 'payload/widget.json': widget },
  );
}

describe('v2.12 能力包原地升级成功路径', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createUpgradeTestContext();
  });
  afterEach(() => ctx.close());

  it('skill：启用态升级后内容更新、句柄不变、暂存目录清空', () => {
    const installed = ctx.service.install(skillPack('1.0.0', 'v1 描述'));
    const after = ctx.service.upgrade(installed.id, skillPack('2.0.0', 'v2 描述'));
    expect(after.capability.version).toBe('2.0.0');
    expect(after.upgrade).toMatchObject({ from: '1.0.0', to: '2.0.0' });
    expect(after.capability.effectRef).toBe('up-skill');
    const skillJson = JSON.parse(
      readFileSync(join(ctx.root, 'skills', 'up-skill', 'skill.json'), 'utf8'),
    ) as { description: string };
    expect(skillJson.description).toBe('v2 描述');
    const staging = join(ctx.root, 'capabilities', '.staging');
    expect(existsSync(staging) ? readdirSync(staging).length : 0).toBe(0);
  });

  it('workflow：加新版本并发布，工作流行不新增', () => {
    const installed = ctx.service.install(buildSamplePack('workflow'));
    const before = ctx.workflows.getWorkflow(installed.effectRef!)!;
    const after = ctx.service.upgrade(
      installed.id,
      bumpPackVersion(buildSamplePack('workflow'), '2.0.0'),
    );
    const workflow = ctx.workflows.getWorkflow(installed.effectRef!)!;
    expect(after.capability.version).toBe('2.0.0');
    expect(workflow.status).toBe('published');
    expect(workflow.currentVersion).toBeGreaterThan(before.currentVersion);
    expect(ctx.workflows.listWorkflows()).toHaveLength(1);
  });

  it('event-script：定义替换，剧本 id 与启用状态不变', () => {
    const installed = ctx.service.install(scriptPack('1.0.0', '第一版台词'));
    const after = ctx.service.upgrade(installed.id, scriptPack('2.0.0', '第二版台词'));
    const row = ctx.eventScripts.get('usr.upnight')!;
    expect(after.capability.effectRef).toBe('usr.upnight');
    expect(row.enabled).toBe(true);
    expect(row.definitionJson).toContain('第二版台词');
  });

  it('report-widget：卡片配置替换，句柄不变', () => {
    const installed = ctx.service.install(widgetPack('1.0.0', 'v1 卡片'));
    const after = ctx.service.upgrade(installed.id, widgetPack('2.0.0', 'v2 卡片'));
    expect(after.capability.effectRef).toBe('com.test.up.widget');
    expect(ctx.reportWidgets.get('com.test.up.widget')?.title).toBe('v2 卡片');
  });

  it('pet-action：重新导入动作，effectRef 变为新 motion id', () => {
    const v1 = buildSamplePack('pet-action', { motionAsset: buildFakeVrma() });
    const installed = ctx.service.install(v1);
    const oldRef = installed.effectRef!;
    const after = ctx.service.upgrade(installed.id, bumpPackVersion(v1, '2.0.0'));
    expect(after.capability.effectRef).not.toBe(oldRef);
    expect(ctx.motions.list()).toHaveLength(1);
    expect(ctx.motions.list()[0]!.id).toBe(after.capability.effectRef);
  });

  it('mcp：摘除旧服务器后按新配置重建，句柄变化', () => {
    const installed = ctx.service.install(mcpPack('1.0.0'));
    const after = ctx.service.upgrade(installed.id, mcpPack('2.0.0'));
    expect(installed.effectRef).toBe('server-1');
    expect(after.capability.effectRef).toBe('server-2');
    expect(ctx.createdServers).toEqual(['server-1', 'server-2']);
  });

  it('禁用态升级：版本前进但保持禁用，不产生副作用', () => {
    const installed = ctx.service.install(skillPack('1.0.0', 'v1 描述'));
    ctx.service.disable(installed.id);
    const after = ctx.service.upgrade(installed.id, skillPack('2.0.0', 'v2 描述'));
    expect(after.capability.status).toBe('disabled');
    expect(after.capability.version).toBe('2.0.0');
    expect(ctx.skills.list().some((item) => item.name === 'up-skill')).toBe(false);
  });
});
