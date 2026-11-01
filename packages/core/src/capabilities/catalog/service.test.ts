import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createInstalledEventScriptRepository,
  createReportWidgetRepository,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { CapabilityCatalogEntry, CapabilityTrustedKey } from '@wbfm/shared/schemas';
import type { McpRegistry } from '../../mcp/registry';
import { createMotionService } from '../../services/media/motion-service';
import { createSkillService } from '../../skills/skill-service';
import { createCapabilityService } from '../capability-service';
import { buildFakeVrma } from '../capability-test-helpers';
import { createCapabilityCatalog } from './service';
import { BUNDLED_CAPABILITY_CATALOG } from './data';

describe('v2.17 能力目录服务', () => {
  let db: DatabaseInstance;
  let service: ReturnType<typeof createCapabilityService>;
  let catalog: ReturnType<typeof createCapabilityCatalog>;
  let signatureSettings: {
    capabilitySignaturePolicy: 'off' | 'warn' | 'require';
    capabilityTrustedKeys: CapabilityTrustedKey[];
  };

  beforeEach(() => {
    signatureSettings = { capabilitySignaturePolicy: 'warn', capabilityTrustedKeys: [] };
    const root = mkdtempSync(join(tmpdir(), 'wbfm-catalog-'));
    setDataRootForTest(root);
    db = createDatabase();
    const skillsDir = join(root, 'skills');
    const skills = createSkillService({ db }, { skillsDir, seedBuiltins: false });
    const mcp = {
      createServer: vi.fn(),
      removeServer: vi.fn(),
    } as unknown as McpRegistry;
    service = createCapabilityService({
      db,
      skills,
      mcp,
      workflows: createWorkflowRepository(db),
      motions: createMotionService(db),
      eventScripts: createInstalledEventScriptRepository(db),
      reportWidgets: createReportWidgetRepository(db),
      settings: { get: () => signatureSettings },
      rootDir: join(root, 'capabilities'),
      skillsDir,
      sampleMotionAsset: () => buildFakeVrma(),
    });
    catalog = createCapabilityCatalog({ capabilities: service });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('按关键词与标签检索，未安装条目带 installed=false', () => {
    const items = catalog.search({ query: '时间' });
    expect(items.map((item) => item.id)).toContain('com.wbfm.sample.capability-demo');
    const skill = items.find((item) => item.id === 'com.wbfm.sample.capability-demo')!;
    expect(skill.kind).toBe('skill');
    expect(skill.installed).toBe(false);
    expect(skill.status).toBeNull();
  });

  it('按 kind 过滤后只返回对应种类', () => {
    const items = catalog.search({ query: '摘要', kind: 'workflow' });
    expect(items.map((item) => item.kind)).toEqual(['workflow']);
    expect(catalog.search({ query: '摘要', kind: 'skill' })).toEqual([]);
  });

  it('无匹配时返回空列表', () => {
    expect(catalog.search({ query: 'zzz-not-exist' })).toEqual([]);
  });

  it('安装内置技能包后启用，重复安装被拒绝', () => {
    const result = catalog.install('com.wbfm.sample.capability-demo');
    expect(result.entry.kind).toBe('skill');
    expect(result.capability.status).toBe('enabled');
    expect(service.list().some((view) => view.id === result.entry.id)).toBe(true);
    expect(catalog.search({ query: '时间' })[0]?.installed).toBe(true);
    expect(() => catalog.install('com.wbfm.sample.capability-demo')).toThrow(/已安装/);
  });

  it('未知目录 id 返回 404', () => {
    expect(() => catalog.install('com.example.not-found')).toThrow(/不存在/);
  });

  it('mcp-preset 安装策略在本版明确拒绝（偏差登记）', () => {
    const mcpEntry: CapabilityCatalogEntry = {
      id: 'com.example.mcp-preset',
      name: 'MCP 预置占位',
      kind: 'mcp',
      description: '占位条目',
      tags: [],
      permissions: ['mcp:connect'],
      effects: [],
      source: 'mcp-preset',
      version: '1.0.0',
      toolNames: [],
      installStrategy: 'mcp-preset',
    };
    const presetCatalog = createCapabilityCatalog({
      capabilities: service,
      entries: [mcpEntry],
    });
    expect(() => presetCatalog.install(mcpEntry.id)).toThrow(/暂不支持自动安装/);
  });

  it('目录条目与示例包 id 一一对应且满足 schema', () => {
    expect(BUNDLED_CAPABILITY_CATALOG.map((entry) => entry.kind).sort()).toEqual([
      'event-script',
      'pet-action',
      'report-widget',
      'skill',
      'workflow',
    ]);
    for (const entry of BUNDLED_CAPABILITY_CATALOG) {
      expect(entry.source).toBe('bundled');
      expect(entry.installStrategy).toBe('bundled-pack');
      expect(entry.version).toBe('1.0.0');
    }
  });
});
