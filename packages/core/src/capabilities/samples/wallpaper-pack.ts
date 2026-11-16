import { strToU8 } from 'fflate';
import { buildSampleZip } from './zip';

/** 1x1 透明 PNG（项目自建，CC0-1.0），用于示例壁纸包与测试 */
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** v4.4 M3：壁纸包样例（安装/内容快照测试共用） */
export function buildSampleWallpaperPack(): Uint8Array {
  const payload = {
    name: '示例壁纸包',
    description: '安装后增加一张可选的场景壁纸；停用即移除。',
    backgrounds: [
      {
        id: 'wallpaper.sample.dusk',
        kind: 'image',
        file: 'payload/assets/sample-dusk.png',
        license: 'CC0-1.0',
      },
    ],
  };
  return buildSampleZip(
    {
      id: 'com.example.sample.wallpaper-pack',
      version: '1.0.0',
      kind: 'wallpaper-pack',
      name: '示例壁纸包',
      description: '安装后增加一张背景壁纸；停用即移除。',
      permissions: ['wallpaper:pack'],
      entry: 'payload/wallpaper-pack.json',
      dependencies: [],
    },
    [
      { path: 'payload/wallpaper-pack.json', bytes: strToU8(JSON.stringify(payload, null, 2)) },
      { path: 'payload/assets/sample-dusk.png', bytes: new Uint8Array(SAMPLE_PNG) },
    ],
  );
}
