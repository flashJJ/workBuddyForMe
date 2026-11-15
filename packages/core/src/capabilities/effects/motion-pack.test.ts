import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import { POSES } from '@wbfm/motion';
import { parseCapabilityZip } from '../manifest';
import { buildSamplePack } from '../samples';
import { disableMotionPack, enableMotionPack, readMotionPackPayload } from './motion-pack';

describe('motion-pack 能力（v4.0 M3）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-motion-pack-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writePack(id: string, payload: unknown): string {
    const dir = join(root, id);
    mkdirSync(join(dir, 'payload'), { recursive: true });
    writeFileSync(join(dir, 'payload/motion-pack.json'), JSON.stringify(payload));
    return dir;
  }

  function manifest(id: string): CapabilityManifest {
    return { id, kind: 'motion-pack', name: id } as CapabilityManifest;
  }

  it('示例包可解析、可启用，启用后只返回句柄', () => {
    const parsed = parseCapabilityZip(buildSamplePack('motion-pack'));
    expect(parsed.manifest.kind).toBe('motion-pack');
    const dir = writePack(parsed.manifest.id, {
      name: '示例内容',
      poses: [
        {
          id: 'com.test.pose.wave',
          mask: { include: ['rightArm'] },
          bones: { rightUpperArm: { z: -0.5 } },
        },
      ],
    });

    expect(enableMotionPack(parsed.manifest, dir)).toBe(parsed.manifest.id);
    expect(readMotionPackPayload(dir).poses[0]?.id).toBe('com.test.pose.wave');
    expect(() => disableMotionPack()).not.toThrow();
  });

  it('空内容、重复 id 与内置冲突都拒绝', () => {
    const empty = writePack('com.test.empty', { name: '空包' });
    expect(() => enableMotionPack(manifest('com.test.empty'), empty)).toThrow(/至少包含/);

    const duplicated = writePack('com.test.dup', {
      name: '重复',
      poses: [
        { id: 'com.test.pose.dup', mask: { include: ['head'] }, bones: {} },
        { id: 'com.test.pose.dup', mask: { include: ['head'] }, bones: {} },
      ],
    });
    expect(() => enableMotionPack(manifest('com.test.dup'), duplicated)).toThrow(/重复/);

    const conflict = writePack('com.test.conflict', {
      name: '冲突',
      poses: [{ id: POSES[0]!.id, mask: { include: ['head'] }, bones: {} }],
    });
    expect(() => enableMotionPack(manifest('com.test.conflict'), conflict)).toThrow(/冲突/);
  });
});
