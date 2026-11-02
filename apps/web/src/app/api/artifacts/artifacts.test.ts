import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as getArtifact } from './[id]/route';

const paramCtx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('产物路由（v2.18 M1）', () => {
  let db: DatabaseInstance;
  let container: ReturnType<typeof __buildContainerForTest>;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-artifact-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    container = __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('GET 返回产物字节、content-type、CSP 与 nosniff', async () => {
    const artifact = container.attachments.saveArtifact({
      title: '架构图',
      filename: 'architecture',
      format: 'html',
      content: '<html><body>hi</body></html>',
    });
    const response = await getArtifact(
      new Request(`http://x/api/artifacts/${artifact.attachmentId}`),
      paramCtx(artifact.attachmentId),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await response.arrayBuffer()).toString('utf8')).toContain('hi');
  });

  it('download=1 返回 attachment disposition 与 UTF-8 文件名', async () => {
    const artifact = container.attachments.saveArtifact({
      title: '图表',
      filename: '图表',
      format: 'svg',
      content: '<svg></svg>',
    });
    const response = await getArtifact(
      new Request(`http://x/api/artifacts/${artifact.attachmentId}?download=1`),
      paramCtx(artifact.attachmentId),
    );
    expect(response.status).toBe(200);
    const disposition = response.headers.get('content-disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent('图表.svg'));
  });

  it('未知产物与图片附件都拒绝', async () => {
    const missing = await getArtifact(
      new Request('http://x/api/artifacts/missing'),
      paramCtx('missing'),
    );
    expect(missing.status).toBe(404);

    const image = container.attachments.save({
      filename: 'a.png',
      mimeType: 'image/png',
      buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });
    const rejected = await getArtifact(
      new Request(`http://x/api/artifacts/${image.id}`),
      paramCtx(image.id),
    );
    expect(rejected.status).toBe(422);
  });
});
