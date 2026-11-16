import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCapabilityRepository, createDatabase } from '@wbfm/database';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import {
  createSceneContentService,
  mergeSceneContent,
  type ScenePackSource,
} from './scene-content-service';

describe('scene-content-service（v4.3 M2）', () => {
  let db: ReturnType<typeof createDatabase>;
  let root: string;

  beforeEach(() => {
    db = createDatabase(':memory:');
    root = mkdtempSync(join(tmpdir(), 'wbfm-scene-content-'));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  function addPack(id: string, sceneId: string, status: 'enabled' | 'disabled' = 'enabled') {
    const manifest = {
      id,
      version: '1.0.0',
      kind: 'scene-pack',
      name: id,
      description: '',
      permissions: ['scene:pack'],
      entry: 'payload/scene-pack.json',
      dependencies: [],
      checksums: {},
    } as unknown as CapabilityManifest;
    createCapabilityRepository(db).create({ manifest, status, effectRef: id });
    mkdirSync(join(root, id, 'payload'), { recursive: true });
    writeFileSync(
      join(root, id, 'payload/scene-pack.json'),
      JSON.stringify({
        name: id,
        scenes: [
          {
            id: sceneId,
            triggers: [],
            beats: [{ at: 0, cue: { kind: 'gesture', gesture: 'nod' } }],
          },
        ],
      }),
    );
  }

  it('没有启用包时返回空快照', () => {
    const service = createSceneContentService({ db, rootDir: root });
    expect(service.get()).toEqual({ version: 'none', scenes: [] });
  });

  it('启用包合并进快照，停用后回到空快照', () => {
    addPack('com.test.scene-pack', 'pack.test.nod');
    const service = createSceneContentService({ db, rootDir: root });
    const content = service.get();
    expect(content.version).toMatch(/^packs:/);
    expect(content.scenes.map((scene) => scene.id)).toEqual(['pack.test.nod']);

    const repo = createCapabilityRepository(db);
    repo.update('com.test.scene-pack', { status: 'disabled', effectRef: null });
    expect(service.get()).toEqual({ version: 'none', scenes: [] });
  });

  it('版本随启用集合变化', () => {
    addPack('com.test.a', 'pack.test.a');
    const service = createSceneContentService({ db, rootDir: root });
    const first = service.get().version;
    addPack('com.test.b', 'pack.test.b');
    const second = service.get().version;
    expect(first).toMatch(/^packs:/);
    expect(second).toMatch(/^packs:/);
    expect(first).not.toBe(second);
  });

  it('跨包 id 冲突拒绝合并', () => {
    const source: ScenePackSource = {
      id: 'a',
      version: '1',
      payload: {
        name: 'a',
        description: '',
        scenes: [
          {
            id: 'pack.test.same',
            triggers: [],
            priority: 2,
            cooldownMs: 0,
            interrupt: 'all',
            beats: [{ at: 0, cue: { kind: 'gesture', gesture: 'nod' } }],
          },
        ],
      },
    };
    expect(() => mergeSceneContent([source])).not.toThrow();
    expect(() => mergeSceneContent([source, { ...source, id: 'b' }])).toThrow(/冲突/);
  });
});
