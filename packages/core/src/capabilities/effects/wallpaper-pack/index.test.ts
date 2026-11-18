import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import {
  enableWallpaperPack,
  readWallpaperPackPayload,
  wallpaperContentType,
} from './index';

let root = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-wallpaper-'));
});

afterEach(() => {
  try {
    fs.rmSync(path.join(root, '..', 'outside.png'), { force: true });
  } catch {
    // 越界用例的临时文件可能不存在
  }
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // Windows 偶发句柄占用
  }
});

function writePack(file = 'payload/assets/dusk.png'): void {
  fs.mkdirSync(path.join(root, 'payload/assets'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'payload/wallpaper-pack.json'),
    JSON.stringify({
      name: '示例壁纸包',
      backgrounds: [{ id: 'wallpaper.sample.dusk', kind: 'image', file, license: 'CC0-1.0' }],
    }),
  );
  fs.writeFileSync(path.join(root, file), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

const manifest = {
  id: 'com.example.sample.wallpaper-pack',
  kind: 'wallpaper-pack',
} as unknown as CapabilityManifest;

describe('v4.4 M3 wallpaper-pack effect', () => {
  it('读取 payload 并启用校验资源存在', () => {
    writePack();
    expect(readWallpaperPackPayload(root).backgrounds).toHaveLength(1);
    expect(enableWallpaperPack(manifest, root)).toBe(manifest.id);
  });

  it('资源缺失时拒绝启用', () => {
    writePack('payload/assets/missing.png');
    fs.rmSync(path.join(root, 'payload/assets/missing.png'));
    expect(() => enableWallpaperPack(manifest, root)).toThrow();
  });

  it('资源路径越界时拒绝启用', () => {
    // 越界到临时目录父级即可触发校验；不要写到文件系统根，避免 Linux 非 root 用户 EACCES
    writePack('payload/../../outside.png');
    expect(() => enableWallpaperPack(manifest, root)).toThrow();
  });

  it('内容类型按扩展名映射', () => {
    expect(wallpaperContentType('payload/a.png')).toBe('image/png');
    expect(wallpaperContentType('payload/a.webp')).toBe('image/webp');
    expect(wallpaperContentType('payload/a.mp4')).toBe('video/mp4');
    expect(wallpaperContentType('payload/a.bin')).toBe('application/octet-stream');
  });
});
