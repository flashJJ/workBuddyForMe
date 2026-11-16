import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import type { McpRegistry } from '../../mcp/registry';
import { createMotionService } from '../../services/media/motion-service';
import { createSkillService } from '../../skills/skill-service';
import { createCapabilityService } from '../capability-service';
import { buildFakeVrma } from '../capability-test-helpers';
import { parseCapabilityZip } from '../manifest';
import { buildSamplePack } from '../samples';
import { disableScenePack, enableScenePack, readScenePackPayload } from './scene-pack';

describe('scene-pack 能力（v4.3 M2）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-scene-pack-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writePack(id: string, payload: unknown): string {
    const dir = join(root, id);
    mkdirSync(join(dir, 'payload'), { recursive: true });
    writeFileSync(join(dir, 'payload/scene-pack.json'), JSON.stringify(payload));
    return dir;
  }

  function manifest(id: string): CapabilityManifest {
    return { id, kind: 'scene-pack', name: id } as CapabilityManifest;
  }

  function scene(id: string) {
    return {
      id,
      triggers: [],
      beats: [{ at: 0, cue: { kind: 'gesture', gesture: 'nod' } }],
    };
  }

  it('示例包可解析、可启用，启用后只返回句柄', () => {
    const parsed = parseCapabilityZip(buildSamplePack('scene-pack'));
    expect(parsed.manifest.kind).toBe('scene-pack');
    const dir = writePack(parsed.manifest.id, {
      name: '示例内容',
      scenes: [scene('pack.test.wave')],
    });

    expect(enableScenePack(parsed.manifest, dir)).toBe(parsed.manifest.id);
    expect(readScenePackPayload(dir).scenes[0]?.id).toBe('pack.test.wave');
    expect(() => disableScenePack()).not.toThrow();
  });

  it('空场景、非 pack. 前缀、重复 id、beats 乱序都拒绝', () => {
    const empty = writePack('com.test.empty', { name: '空包', scenes: [] });
    expect(() => enableScenePack(manifest('com.test.empty'), empty)).toThrow(/至少/);

    const prefix = writePack('com.test.prefix', {
      name: '前缀',
      scenes: [scene('touch.head')],
    });
    expect(() => enableScenePack(manifest('com.test.prefix'), prefix)).toThrow(/pack\./);

    const duplicated = writePack('com.test.dup', {
      name: '重复',
      scenes: [scene('pack.test.dup'), scene('pack.test.dup')],
    });
    expect(() => enableScenePack(manifest('com.test.dup'), duplicated)).toThrow(/重复/);

    const unordered = writePack('com.test.order', {
      name: '乱序',
      scenes: [
        {
          id: 'pack.test.order',
          beats: [
            { at: 100, cue: { kind: 'gesture', gesture: 'nod' } },
            { at: 0, cue: { kind: 'gesture', gesture: 'nod' } },
          ],
        },
      ],
    });
    expect(() => enableScenePack(manifest('com.test.order'), unordered)).toThrow(/升序/);
  });

  it('非法 JSON 拒绝', () => {
    const dir = join(root, 'com.test.bad');
    mkdirSync(join(dir, 'payload'), { recursive: true });
    writeFileSync(join(dir, 'payload/scene-pack.json'), '{');
    expect(() => readScenePackPayload(dir)).toThrow(/合法 JSON/);
  });
});

describe('scene-pack 安装链路（v4.3 M2）', () => {
  let db: DatabaseInstance;
  let root: string;
  let service: ReturnType<typeof createCapabilityService>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-scene-pack-install-'));
    setDataRootForTest(root);
    db = createDatabase();
    const skillsDir = join(root, 'skills');
    const skills = createSkillService({ db }, { skillsDir, seedBuiltins: false });
    const mcp = {
      createServer: vi.fn(() => ({ id: 'server-1' })),
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
      settings: {
        get: () => ({ capabilitySignaturePolicy: 'warn' as const, capabilityTrustedKeys: [] }),
      },
      rootDir: join(root, 'capabilities'),
      skillsDir,
      sampleMotionAsset: () => buildFakeVrma(),
    });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('样例场景包可安装、停用、启用与卸载', () => {
    const installed = service.install(service.sample('scene-pack'));
    expect(installed.kind).toBe('scene-pack');
    expect(installed.status).toBe('enabled');
    expect(installed.effectRef).toBe('com.example.sample.scene-pack');

    expect(service.disable(installed.id).status).toBe('disabled');
    expect(service.enable(installed.id).status).toBe('enabled');
    service.uninstall(installed.id);
    expect(service.list().some((item) => item.id === installed.id)).toBe(false);
  });
});
