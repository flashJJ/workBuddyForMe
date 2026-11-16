import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createInstalledEventScriptRepository,
  createReportWidgetRepository,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { PROP_PACK_MAX_ASSET_BYTES, type CapabilityManifest } from '@wbfm/shared/schemas';
import type { McpRegistry } from '../../../mcp/registry';
import { createMotionService } from '../../../services/media/motion-service';
import { createSkillService } from '../../../skills/skill-service';
import { createCapabilityService } from '../../capability-service';
import { buildFakeVrma } from '../../capability-test-helpers';
import { parseCapabilityZip } from '../../manifest';
import { buildSamplePack } from '../../samples';
import {
  disablePropPack,
  enablePropPack,
  readPropAsset,
  readPropPackPayload,
} from './index';

describe('prop-pack 能力（v4.3 M3）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-prop-pack-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writePack(
    id: string,
    payload: unknown,
    assets: Record<string, Uint8Array | string> = {},
  ): string {
    const dir = join(root, id);
    mkdirSync(join(dir, 'payload'), { recursive: true });
    writeFileSync(join(dir, 'payload/prop-pack.json'), JSON.stringify(payload));
    for (const [path, bytes] of Object.entries(assets)) {
      const target = join(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    return dir;
  }

  function manifest(id: string): CapabilityManifest {
    return { id, kind: 'prop-pack', name: id } as CapabilityManifest;
  }

  function prop(id: string) {
    return {
      id,
      kind: 'stage',
      file: 'payload/assets/cube.glb',
      license: 'CC0-1.0',
      position: [0, 0, 0],
    };
  }

  it('示例包可解析、读取资源并启用', () => {
    const parsed = parseCapabilityZip(buildSamplePack('prop-pack'));
    expect(parsed.manifest.kind).toBe('prop-pack');
    const dir = join(root, parsed.manifest.id);
    for (const [path, bytes] of Object.entries(parsed.files)) {
      const target = join(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }

    expect(enablePropPack(parsed.manifest, dir)).toBe(parsed.manifest.id);
    expect(readPropPackPayload(dir).props[0]?.id).toBe('pack.sample.cube');
    const asset = readPropAsset(dir, 'payload/assets/sample-cube.glb');
    expect(asset.subarray(0, 4).toString('utf8')).toBe('glTF');
    expect(() => disablePropPack()).not.toThrow();
  });

  it('空包、非 pack. 前缀、重复 id、缺许可都拒绝', () => {
    const empty = writePack('com.test.empty', { name: '空包', props: [] });
    expect(() => enablePropPack(manifest('com.test.empty'), empty)).toThrow(/至少/);

    const prefix = writePack('com.test.prefix', {
      name: '前缀',
      props: [{ ...prop('teacup'), file: 'payload/assets/cube.glb' }],
    });
    expect(() => enablePropPack(manifest('com.test.prefix'), prefix)).toThrow(/pack\./);

    const duplicated = writePack('com.test.dup', {
      name: '重复',
      props: [prop('pack.test.dup'), prop('pack.test.dup')],
    });
    expect(() => enablePropPack(manifest('com.test.dup'), duplicated)).toThrow(/重复/);

    const { license: _license, ...noLicense } = prop('pack.test.license');
    const licensed = writePack('com.test.license', { name: '许可', props: [noLicense] });
    expect(() => enablePropPack(manifest('com.test.license'), licensed)).toThrow(/校验失败/);
  });

  it('缺失资源、路径越界与超大资源都拒绝', () => {
    const missing = writePack('com.test.missing', { name: '缺失', props: [prop('pack.test.missing')] });
    expect(() => enablePropPack(manifest('com.test.missing'), missing)).toThrow(/不存在/);

    const escape = writePack('com.test.escape', {
      name: '越界',
      props: [{ ...prop('pack.test.escape'), file: 'payload/../../outside.glb' }],
    });
    expect(() => enablePropPack(manifest('com.test.escape'), escape)).toThrow(/越界/);

    const huge = writePack(
      'com.test.huge',
      { name: '超大', props: [prop('pack.test.huge')] },
      { 'payload/assets/cube.glb': Buffer.alloc(PROP_PACK_MAX_ASSET_BYTES + 1) },
    );
    expect(() => enablePropPack(manifest('com.test.huge'), huge)).toThrow(/5MB/);
    expect(statSync(join(huge, 'payload/assets/cube.glb')).size).toBeGreaterThan(
      PROP_PACK_MAX_ASSET_BYTES,
    );
  });
});

describe('prop-pack 安装链路（v4.3 M3）', () => {
  let db: DatabaseInstance;
  let root: string;
  let service: ReturnType<typeof createCapabilityService>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-prop-pack-install-'));
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

  it('样例道具包可安装、停用、启用与卸载', () => {
    const installed = service.install(service.sample('prop-pack'));
    expect(installed.kind).toBe('prop-pack');
    expect(installed.status).toBe('enabled');
    expect(installed.effectRef).toBe('com.example.sample.prop-pack');

    expect(service.disable(installed.id).status).toBe('disabled');
    expect(service.enable(installed.id).status).toBe('enabled');
    service.uninstall(installed.id);
    expect(service.list().some((item) => item.id === installed.id)).toBe(false);
  });
});
