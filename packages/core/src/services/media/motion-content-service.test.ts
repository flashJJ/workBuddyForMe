import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCapabilityRepository, createDatabase } from '@wbfm/database';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import { DEFAULT_MOTION_CONTENT } from '@wbfm/motion';
import { createMotionContentService, mergeMotionContent, type MotionPackSource } from './motion-content-service';

describe('motion-content-service（v4.0 M4）', () => {
  let db: ReturnType<typeof createDatabase>;
  let root: string;

  beforeEach(() => {
    db = createDatabase(':memory:');
    root = mkdtempSync(join(tmpdir(), 'wbfm-motion-content-'));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  function addPack(id: string, poseId: string, status: 'enabled' | 'disabled' = 'enabled') {
    const manifest = {
      id,
      version: '1.0.0',
      kind: 'motion-pack',
      name: id,
      description: '',
      permissions: ['motion:pack'],
      entry: 'payload/motion-pack.json',
      dependencies: [],
      checksums: {},
    } as unknown as CapabilityManifest;
    createCapabilityRepository(db).create({ manifest, status, effectRef: id });
    mkdirSync(join(root, id, 'payload'), { recursive: true });
    writeFileSync(
      join(root, id, 'payload/motion-pack.json'),
      JSON.stringify({
        name: id,
        poses: [{ id: poseId, mask: { include: ['head'] }, bones: {} }],
      }),
    );
  }

  it('没有启用包时返回默认快照（同引用）', () => {
    const service = createMotionContentService({ db, rootDir: root });
    expect(service.get()).toBe(DEFAULT_MOTION_CONTENT);
  });

  it('启用包合并进默认内容，停用后回到默认', () => {
    addPack('com.test.pack', 'com.test.pose.nod');
    const service = createMotionContentService({ db, rootDir: root });
    const content = service.get();
    expect(content).not.toBe(DEFAULT_MOTION_CONTENT);
    expect(content.version).toMatch(/^packs:/);
    expect(content.poses.map((item) => item.id)).toContain('com.test.pose.nod');
    expect(content.poses.map((item) => item.id)).toContain(DEFAULT_MOTION_CONTENT.poses[0]!.id);

    const repo = createCapabilityRepository(db);
    repo.update('com.test.pack', { status: 'disabled', effectRef: null });
    expect(service.get()).toBe(DEFAULT_MOTION_CONTENT);
  });

  it('跨包 id 冲突拒绝合并', () => {
    expect(() =>
      mergeMotionContent([
        {
          id: 'a',
          version: '1',
          payload: { name: 'a', description: '', poses: [], motions: [], behaviors: [] },
        },
        {
          id: 'b',
          version: '1',
          payload: { name: 'b', description: '', poses: [], motions: [], behaviors: [] },
        },
      ]),
    ).not.toThrow();

    const duplicate: MotionPackSource = {
      id: 'a',
      version: '1',
      payload: {
        name: 'a',
        description: '',
        poses: [{ id: 'same.pose', mask: { include: ['head'] }, bones: {} }],
        motions: [],
        behaviors: [],
      },
    };
    const sources: MotionPackSource[] = [duplicate, { ...duplicate, id: 'b' }];
    expect(() => mergeMotionContent(sources)).toThrow(/冲突/);
  });
});
