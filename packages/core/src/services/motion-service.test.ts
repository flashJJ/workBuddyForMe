import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createMotionService } from './motion-service';
import { createDatabase } from '@wbfm/database';

describe('motion-service', () => {
  let db: ReturnType<typeof createDatabase>;
  let svc: ReturnType<typeof createMotionService>;

  beforeEach(() => {
    db = createDatabase(':memory:');
    svc = createMotionService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('上传合法 VRMA 文件成功落库', () => {
    const buffer = buildFakeVrma();
    const motion = svc.importMotion({ filename: 'test.vrma', buffer, name: 'test' });
    expect(motion.id).toBeTruthy();
    expect(motion.fileRef).toMatch(/^motion-/);
    expect(motion.name).toBe('test');
    const read = svc.readFile(motion.fileRef);
    expect(read.byteLength).toBe(buffer.byteLength);
  });

  it('非 .vrma 扩展拒绝', () => {
    expect(() => svc.importMotion({ filename: 'a.vrm', buffer: new Uint8Array(4) })).toThrow(
      /仅支持 \.vrma/,
    );
  });

  it('超 10MB 拒绝', () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    expect(() => svc.importMotion({ filename: 'big.vrma', buffer: big })).toThrow(/超过 10MB/);
  });

  it('非 glb 魔数拒绝', () => {
    expect(() => svc.importMotion({ filename: 'a.vrma', buffer: new Uint8Array(4) })).toThrow(
      /不是合法的 glTF/,
    );
  });

  it('无 VRMC_vrm_animation 扩展的 glb 拒绝', () => {
    const glbNoVrma = buildFakeGlb({ extensionsUsed: [] });
    expect(() => svc.importMotion({ filename: 'a.vrma', buffer: glbNoVrma })).toThrow(
      /缺少 VRMC_vrm_animation 扩展/,
    );
  });

  it('删除后文件与记录一并移除', () => {
    const buffer = buildFakeVrma();
    const motion = svc.importMotion({ filename: 'del.vrma', buffer });
    svc.delete(motion.id);
    expect(svc.get(motion.id)).toBeNull();
    expect(() => svc.readFile(motion.fileRef)).toThrow();
  });

  it('fileRef 路径穿越被守卫', () => {
    expect(() => svc.readFile('../evil.vrma')).toThrow(/不存在/);
    expect(() => svc.readFile('motion-%2e%2e%2fevil.vrma')).toThrow(/不存在/);
  });
});

function buildFakeVrma(): Uint8Array {
  return buildFakeGlb({
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: { specVersion: '1.0' } },
  });
}

function buildFakeGlb(extra: { extensionsUsed?: string[]; extensions?: unknown }): Uint8Array {
  const json = JSON.stringify({ asset: { version: '2.0' }, ...extra });
  const jsonBytes = new TextEncoder().encode(json);
  const total = 20 + jsonBytes.length;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  // GLB 规范：magic 与 chunk type 均为 LE uint32（'glTF' / 'JSON'）
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf).set(jsonBytes, 20);
  return new Uint8Array(buf);
}
