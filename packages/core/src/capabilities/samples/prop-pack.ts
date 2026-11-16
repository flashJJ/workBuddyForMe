import { strToU8 } from 'fflate';
import { buildSampleZip } from './zip';
import { SAMPLE_PROP_GLB } from './prop-asset';

/** v4.3 M3：道具包样例（安装/内容快照测试共用） */
export function buildSamplePropPack(): Uint8Array {
  const payload = {
    name: '示例道具包',
    description: '安装后增加一个可被剧本 prop cue 引用的桌面道具；停用即移除。',
    props: [
      {
        id: 'pack.sample.cube',
        kind: 'stage',
        file: 'payload/assets/sample-cube.glb',
        license: 'CC0-1.0',
        position: [0.22, 0, -0.1],
        rotationY: 0.3,
      },
    ],
  };
  return buildSampleZip(
    {
      id: 'com.example.sample.prop-pack',
      version: '1.0.0',
      kind: 'prop-pack',
      name: '示例道具包',
      description: '安装后增加一个桌面道具；停用即移除。',
      permissions: ['prop:pack'],
      entry: 'payload/prop-pack.json',
      dependencies: [],
    },
    [
      { path: 'payload/prop-pack.json', bytes: strToU8(JSON.stringify(payload, null, 2)) },
      { path: 'payload/assets/sample-cube.glb', bytes: SAMPLE_PROP_GLB },
    ],
  );
}
