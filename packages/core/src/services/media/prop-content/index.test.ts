import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCapabilityRepository, createDatabase } from '@wbfm/database';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import {
  createPropContentService,
  mergePropContent,
  type PropPackSource,
} from './index';

describe('prop-content-service（v4.3 M3）', () => {
  let db: ReturnType<typeof createDatabase>;
  let root: string;

  beforeEach(() => {
    db = createDatabase(':memory:');
    root = mkdtempSync(join(tmpdir(), 'wbfm-prop-content-'));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  function addPack(id: string, propId: string, status: 'enabled' | 'disabled' = 'enabled') {
    const manifest = {
      id,
      version: '1.0.0',
      kind: 'prop-pack',
      name: id,
      description: '',
      permissions: ['prop:pack'],
      entry: 'payload/prop-pack.json',
      dependencies: [],
      checksums: {},
    } as unknown as CapabilityManifest;
    createCapabilityRepository(db).create({ manifest, status, effectRef: id });
    mkdirSync(join(root, id, 'payload/assets'), { recursive: true });
    writeFileSync(
      join(root, id, 'payload/prop-pack.json'),
      JSON.stringify({
        name: id,
        props: [
          {
            id: propId,
            kind: 'stage',
            file: 'payload/assets/cube.glb',
            license: 'CC0-1.0',
            position: [0, 0, 0],
          },
        ],
      }),
    );
    writeFileSync(join(root, id, 'payload/assets/cube.glb'), 'glTF-test');
  }

  it('没有启用包时返回空快照', () => {
    const service = createPropContentService({ db, rootDir: root });
    expect(service.get()).toEqual({ version: 'none', props: [] });
  });

  it('启用包合并进快照，生成资源 URL；停用后回到空快照', () => {
    addPack('com.test.prop-pack', 'pack.test.cube');
    const service = createPropContentService({ db, rootDir: root });
    const content = service.get();
    expect(content.version).toMatch(/^packs:/);
    expect(content.props.map((prop) => prop.id)).toEqual(['pack.test.cube']);

    const url = new URL(content.props[0]!.url, 'http://localhost');
    expect(url.pathname).toBe('/api/prop-assets');
    expect(url.searchParams.get('pack')).toBe('com.test.prop-pack');
    expect(url.searchParams.get('file')).toBe('payload/assets/cube.glb');

    const repo = createCapabilityRepository(db);
    repo.update('com.test.prop-pack', { status: 'disabled', effectRef: null });
    expect(service.get()).toEqual({ version: 'none', props: [] });
  });

  it('版本随启用集合变化', () => {
    addPack('com.test.a', 'pack.test.a');
    const service = createPropContentService({ db, rootDir: root });
    const first = service.get().version;
    addPack('com.test.b', 'pack.test.b');
    const second = service.get().version;
    expect(first).toMatch(/^packs:/);
    expect(second).toMatch(/^packs:/);
    expect(first).not.toBe(second);
  });

  it('跨包 id 冲突拒绝合并', () => {
    const source: PropPackSource = {
      id: 'a',
      version: '1',
      payload: {
        name: 'a',
        description: '',
        props: [
          {
            id: 'pack.test.same',
            kind: 'stage',
            file: 'payload/assets/cube.glb',
            license: 'CC0-1.0',
            position: [0, 0, 0],
          },
        ],
      },
    };
    expect(() => mergePropContent([source])).not.toThrow();
    expect(() => mergePropContent([source, { ...source, id: 'b' }])).toThrow(/冲突/);
  });

  it('资源读取只服务已启用包与已声明文件', () => {
    addPack('com.test.prop-pack', 'pack.test.cube');
    const service = createPropContentService({ db, rootDir: root });

    const asset = service.readAsset('com.test.prop-pack', 'payload/assets/cube.glb');
    expect(asset.contentType).toBe('model/gltf-binary');
    expect(asset.buffer.toString('utf8')).toBe('glTF-test');

    expect(() => service.readAsset('com.test.prop-pack', 'payload/assets/other.glb')).toThrow(
      /不存在/,
    );
    expect(() => service.readAsset('com.test.missing', 'payload/assets/cube.glb')).toThrow(
      /不存在/,
    );

    const repo = createCapabilityRepository(db);
    repo.update('com.test.prop-pack', { status: 'disabled', effectRef: null });
    expect(() =>
      service.readAsset('com.test.prop-pack', 'payload/assets/cube.glb'),
    ).toThrow(/不存在/);
  });
});
