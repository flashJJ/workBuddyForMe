import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { POST as uploadMotion } from './route';

/** 最小合法 VRMA 容器（glb + VRMC_vrm_animation 扩展标记），与 motion-service 单测同口径 */
function buildFakeVrma(): Uint8Array {
  const json = JSON.stringify({
    asset: { version: '2.0' },
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: { specVersion: '1.0' } },
  });
  const jsonBytes = new TextEncoder().encode(json);
  const total = 20 + jsonBytes.length;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  new Uint8Array(buf).set(jsonBytes, 20);
  return new Uint8Array(buf);
}

function uploadRequest(fields: Record<string, string> = {}, filename = 'idle.vrma') {
  const form = new FormData();
  form.append(
    'file',
    new Blob([buildFakeVrma() as unknown as BlobPart], { type: 'application/octet-stream' }),
    filename,
  );
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request('http://x/api/motions', { method: 'POST', body: form });
}

describe('待机动作路由（v2.2 导入标注）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-motion-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('带段/档位/条目键/门槛上传 → 201 且读回一致', async () => {
    const response = await uploadMotion(
      uploadRequest({
        name: '招手-循环',
        segment: 'b_loop',
        mood: 'good',
        entryKey: 'wave',
        minRelationshipLevel: '2',
      }),
    );
    expect(response.status).toBe(201);
    const motion = (await response.json()).data.motion;
    expect(motion.segment).toBe('b_loop');
    expect(motion.mood).toBe('good');
    expect(motion.entryKey).toBe('wave');
    expect(motion.minRelationshipLevel).toBe(2);
    expect(motion.name).toBe('招手-循环');
  });

  it('不带标注上传 → 回落缺省（single / normal / 自成条目 / 无门槛）', async () => {
    const response = await uploadMotion(uploadRequest());
    expect(response.status).toBe(201);
    const motion = (await response.json()).data.motion;
    expect(motion.segment).toBe('single');
    expect(motion.mood).toBe('normal');
    expect(motion.entryKey ?? null).toBeNull();
    expect(motion.minRelationshipLevel ?? null).toBeNull();
  });

  it('词表外的段/档位、越界门槛 → 422（不落库）', async () => {
    expect((await uploadMotion(uploadRequest({ segment: 'weird' }))).status).toBe(422);
    expect((await uploadMotion(uploadRequest({ mood: 'bogus' }))).status).toBe(422);
    expect((await uploadMotion(uploadRequest({ minRelationshipLevel: '9' }))).status).toBe(422);
  });
});
