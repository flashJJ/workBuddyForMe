import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createVrmAvatarService } from './vrm-avatar-service';
import { createDatabase } from '@wbfm/database';

describe('vrm-avatar-service', () => {
  let db: ReturnType<typeof createDatabase>;
  let svc: ReturnType<typeof createVrmAvatarService>;

  beforeEach(() => {
    db = createDatabase(':memory:');
    svc = createVrmAvatarService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('上传合法 VRM 文件成功落库', () => {
    const buffer = buildFakeVrm();
    const avatar = svc.importAvatar({ filename: 'test.vrm', buffer, name: 'test' });
    expect(avatar.id).toBeTruthy();
    expect(avatar.fileRef).toMatch(/^vrm-/);
    expect(avatar.name).toBe('test');
    const read = svc.readFile(avatar.fileRef);
    expect(read.byteLength).toBe(buffer.byteLength);
  });

  it('非 .vrm 扩展拒绝', () => {
    expect(() => svc.importAvatar({ filename: 'a.glb', buffer: new Uint8Array(4) })).toThrow(
      /仅支持 \.vrm/,
    );
  });

  it('超 60MB 拒绝', () => {
    const big = new Uint8Array(60 * 1024 * 1024 + 1);
    expect(() => svc.importAvatar({ filename: 'big.vrm', buffer: big })).toThrow(/超过 60MB/);
  });

  it('非 glb 魔数拒绝', () => {
    expect(() => svc.importAvatar({ filename: 'a.vrm', buffer: new Uint8Array(4) })).toThrow(
      /不是合法的 glTF/,
    );
  });

  it('无 VRM 扩展的 glb 拒绝', () => {
    const glbNoVrm = buildFakeGlb({ extensionsUsed: [] });
    expect(() => svc.importAvatar({ filename: 'a.vrm', buffer: glbNoVrm })).toThrow(/缺少 VRM 扩展/);
  });

  it('删除后文件与记录一并移除', () => {
    const buffer = buildFakeVrm();
    const avatar = svc.importAvatar({ filename: 'del.vrm', buffer });
    svc.delete(avatar.id);
    expect(svc.get(avatar.id)).toBeNull();
    expect(() => svc.readFile(avatar.fileRef)).toThrow();
  });

  it('fileRef 路径穿越被守卫', () => {
    expect(() => svc.readFile('../evil.vrm')).toThrow(/不存在/);
    expect(() => svc.readFile('vrm-%2e%2e%2fevil.vrm')).toThrow(/不存在/);
  });
});

function buildFakeVrm(): Uint8Array {
  return buildFakeGlb({ extensionsUsed: ['VRMC_vrm'], extensions: { VRMC_vrm: { meta: { name: 'FakeVrm' } } } });
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
