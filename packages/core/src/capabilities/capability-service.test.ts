import { createHash as hash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { McpRegistry } from '../mcp/registry';
import { createSkillService } from '../skills/skill-service';
import { createCapabilityService } from './capability-service';
import { buildSampleSkillPack } from './manifest';

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
    service = createCapabilityService({
      db,
      skills,
      mcp,
      rootDir: join(root, 'capabilities'),
      skillsDir,
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
      id: 'com.test.workflow',
      version: '1.0.0',
      kind: 'workflow',
      name: '未接入类型',
      permissions: ['workflow:install'],
      entry: 'payload/flow.json',
      dependencies: [],
      checksums: { 'payload/flow.json': 'a'.repeat(64) },
    }, { 'payload/flow.json': '{}' }))).toThrow(/尚未接入/);

    const sample = buildSampleSkillPack();
    service.install(sample);
    expect(() => service.install(sample)).toThrow(/已安装/);
  });
});
