import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  copyBackground,
  isBackgroundId,
  listBackgrounds,
  removeBackground,
  sniffBackgroundKind,
} from './background-store';

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MP4_HEAD = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

let root = '';
let dir = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-bg-'));
  dir = path.join(root, 'backgrounds');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSource(name: string, head: Buffer, bytes = 0): string {
  const file = path.join(root, name);
  fs.writeFileSync(file, Buffer.concat([head, Buffer.alloc(bytes)]));
  return file;
}

describe('v4.4 M2 背景文件存储', () => {
  it('复制图片后可按 id 列出并删除', () => {
    const source = writeSource('scene.png', PNG_HEAD, 32);
    const picked = copyBackground(dir, source);
    expect(picked.canceled).toBe(false);
    expect(picked.file?.kind).toBe('image');
    expect(picked.file && isBackgroundId(picked.file.id)).toBe(true);

    const listed = listBackgrounds(dir);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.bytes).toBe(40);

    expect(removeBackground(dir, listed[0]!.id)).toBe(true);
    expect(listBackgrounds(dir)).toHaveLength(0);
    expect(removeBackground(dir, listed[0]!.id)).toBe(false);
  });

  it('按内容头判定类型，拒绝扩展名伪装', () => {
    const fakeMp4 = writeSource('fake.mp4', PNG_HEAD, 8);
    expect(copyBackground(dir, fakeMp4)).toMatchObject({ canceled: false, reason: 'unsupported' });

    const fakePng = writeSource('fake.png', Buffer.from('not an image'));
    expect(copyBackground(dir, fakePng)).toMatchObject({ canceled: false, reason: 'unsupported' });
  });

  it('拒绝不支持扩展名与超过上限的文件', () => {
    const gif = writeSource('a.gif', PNG_HEAD);
    expect(copyBackground(dir, gif).reason).toBe('unsupported');

    const big = writeSource('big.png', PNG_HEAD, 64);
    expect(copyBackground(dir, big, { imageBytes: 16 }).reason).toBe('too-large');
    expect(listBackgrounds(dir)).toHaveLength(0);
  });

  it('列表忽略非法文件名，删除拒绝路径穿越', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '..evil.png'), PNG_HEAD);
    fs.writeFileSync(path.join(dir, 'note.txt'), 'x');
    const valid = writeSource('ok.png', PNG_HEAD);
    const picked = copyBackground(dir, valid);
    expect(listBackgrounds(dir).map((item) => item.id)).toEqual([picked.file!.id]);

    expect(removeBackground(dir, '../ok.png')).toBe(false);
    expect(removeBackground(dir, 'not-a-uuid.png')).toBe(false);
  });

  it('识别四种图片与 MP4 头', () => {
    expect(sniffBackgroundKind(PNG_HEAD)).toBe('image');
    expect(sniffBackgroundKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image');
    expect(sniffBackgroundKind(Buffer.from('RIFF0000WEBP'))).toBe('image');
    expect(sniffBackgroundKind(MP4_HEAD)).toBe('video');
    expect(sniffBackgroundKind(Buffer.from('xxxx'))).toBeNull();
  });
});
