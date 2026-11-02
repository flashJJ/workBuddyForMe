import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest, getDataDir } from '@wbfm/config';
import { createWebCipher } from '../../secrets/cipher';
import { createAttachmentService } from './attachment-service';

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('附件服务（T4）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-attach-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('save：校验通过后落盘并登记，文件名约定为 <id>.<ext>', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    const saved = service.save({ filename: 'a.png', mimeType: 'image/png', buffer: PNG_BYTES });

    expect(saved.mimeType).toBe('image/png');
    expect(saved.byteSize).toBe(PNG_BYTES.byteLength);
    expect(existsSync(join(getDataDir('attachments'), `${saved.id}.png`))).toBe(true);
    const row = service.read(saved.id);
    expect(row.buffer).toEqual(Buffer.from(PNG_BYTES));
  });

  it('save：同 sha256 内容去重复用，不重复落盘', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    const first = service.save({ filename: 'a.png', mimeType: 'image/png', buffer: PNG_BYTES });
    const second = service.save({ filename: 'b.png', mimeType: 'image/png', buffer: PNG_BYTES });

    expect(second.id).toBe(first.id);
  });

  it('save：非法 mime / 空内容 / 超 10MB 拒绝', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    expect(() =>
      service.save({ filename: 'a.gif', mimeType: 'image/gif', buffer: PNG_BYTES }),
    ).toThrowError(/不支持的图片类型/);
    expect(() =>
      service.save({ filename: 'a.png', mimeType: 'image/png', buffer: new Uint8Array(0) }),
    ).toThrowError(/为空/);
    expect(() =>
      service.save({
        filename: 'big.png',
        mimeType: 'image/png',
        buffer: new Uint8Array(10 * 1024 * 1024 + 1),
      }),
    ).toThrowError(/10MB/);
  });

  it('requireRowsByIds：缺失 ID 抛校验错误；loadImages 返回保序 data', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    const saved = service.save({ filename: 'a.jpg', mimeType: 'image/jpeg', buffer: PNG_BYTES });

    expect(() => service.requireRowsByIds(['missing-id'])).toThrowError(/不存在/);
    const images = service.loadImages([saved.id]);
    expect(images).toEqual([
      {
        attachmentId: saved.id,
        mimeType: 'image/jpeg',
        dataBase64: Buffer.from(PNG_BYTES).toString('base64'),
      },
    ]);
  });

  it('read：不存在抛 404', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    expect(() => service.read('nope')).toThrowError(/NOT_FOUND|附件/);
  });

  it('saveArtifact：html/svg/md 落盘并返回产物引用，文件名强制扩展名', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    const html = service.saveArtifact({
      title: '架构图',
      filename: '架构/图*',
      format: 'html',
      content: '<html><body>diagram</body></html>',
    });
    expect(html.format).toBe('html');
    expect(html.mimeType).toBe('text/html');
    expect(html.filename).toBe('架构-图-.html');
    expect(existsSync(join(getDataDir('attachments'), `${html.attachmentId}.html`))).toBe(true);

    const svg = service.saveArtifact({
      title: 'SVG',
      filename: 'chart.svg',
      format: 'svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    expect(svg.filename).toBe('chart.svg');
    expect(existsSync(join(getDataDir('attachments'), `${svg.attachmentId}.svg`))).toBe(true);

    const md = service.saveArtifact({
      title: '说明',
      filename: 'notes',
      format: 'md',
      content: '# 标题',
    });
    expect(md.filename).toBe('notes.md');
    expect(existsSync(join(getDataDir('attachments'), `${md.attachmentId}.md`))).toBe(true);
  });

  it('saveArtifact：空标题/空内容/超 2MB 拒绝', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    expect(() =>
      service.saveArtifact({ title: ' ', filename: 'a', format: 'html', content: '<p>x</p>' }),
    ).toThrowError(/标题/);
    expect(() =>
      service.saveArtifact({ title: 'a', filename: 'a', format: 'html', content: '' }),
    ).toThrowError(/为空/);
    expect(() =>
      service.saveArtifact({
        title: 'big',
        filename: 'big',
        format: 'html',
        content: 'x'.repeat(2 * 1024 * 1024 + 1),
      }),
    ).toThrowError(/2MB/);
  });

  it('readArtifact：返回产物字节；图片附件与未知 ID 拒绝', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    const artifact = service.saveArtifact({
      title: '图表',
      filename: 'chart',
      format: 'svg',
      content: '<svg></svg>',
    });
    const read = service.readArtifact(artifact.attachmentId);
    expect(read.mimeType).toBe('image/svg+xml');
    expect(read.buffer.toString('utf8')).toBe('<svg></svg>');

    const image = service.save({ filename: 'a.png', mimeType: 'image/png', buffer: PNG_BYTES });
    expect(() => service.readArtifact(image.id)).toThrowError(/不是可预览产物/);
    expect(() => service.readArtifact('missing')).toThrowError(/不存在/);
  });
});
