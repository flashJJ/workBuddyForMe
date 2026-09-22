import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { POST as uploadAttachment } from './route';
import { GET as getAttachment } from './[id]/route';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function uploadRequest(filename: string, type: string, bytes: Uint8Array) {
  const form = new FormData();
  form.append('file', new Blob([bytes as unknown as BlobPart], { type }), filename);
  return new Request('http://x/api/attachments', { method: 'POST', body: form });
}

const paramCtx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('附件路由（T5）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-attach-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('POST 合法图片 → 201 元数据；GET 原样回流字节与 content-type', async () => {
    const postResponse = await uploadAttachment(uploadRequest('shot.png', 'image/png', PNG_BYTES));
    expect(postResponse.status).toBe(201);
    const attachment = (await postResponse.json()).data;
    expect(attachment.mimeType).toBe('image/png');
    expect(attachment.byteSize).toBe(PNG_BYTES.byteLength);

    const getResponse = await getAttachment(
      new Request(`http://x/api/attachments/${attachment.id}`),
      paramCtx(attachment.id),
    );
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('content-type')).toBe('image/png');
    const returned = new Uint8Array(await getResponse.arrayBuffer());
    expect(Array.from(returned)).toEqual(Array.from(PNG_BYTES));
  });

  it('POST gif 等非允许类型 → 422', async () => {
    const response = await uploadAttachment(
      uploadRequest('a.gif', 'image/gif', new Uint8Array([1, 2, 3])),
    );
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(payload.error.message).toContain('不支持的图片类型');
  });

  it('GET 不存在附件 → 404', async () => {
    const response = await getAttachment(
      new Request('http://x/api/attachments/missing'),
      paramCtx('missing'),
    );
    expect(response.status).toBe(404);
  });
});
