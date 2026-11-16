import { strToU8 } from 'fflate';
import { buildSampleZip } from './zip';

function sampleScenePackPayload(): Uint8Array {
  const payload = {
    name: '示例场景包',
    description: '抬手触发的一段问候；也可在剧本调试面板手动播放。',
    scenes: [
      {
        id: 'pack.sample.raised-greeting',
        triggers: ['touch::raised::tap'],
        priority: 1,
        cooldownMs: 60_000,
        interrupt: 'all',
        beats: [
          { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 1200 } },
          { at: 120, cue: { kind: 'gesture', gesture: 'nod', intensity: 0.8 } },
          { at: 600, cue: { kind: 'speak', text: '场景包安装成功，抬手就能看到我。' } },
          { at: 2400, cue: { kind: 'expression', tag: 'neutral', holdMs: 800 } },
        ],
      },
      {
        id: 'pack.sample.cube-showcase',
        triggers: [],
        priority: 1,
        cooldownMs: 10_000,
        interrupt: 'all',
        beats: [
          { at: 0, cue: { kind: 'prop', prop: 'pack.sample.cube', action: 'show' } },
          { at: 3000, cue: { kind: 'prop', prop: 'pack.sample.cube', action: 'hide' } },
        ],
      },
    ],
  };
  return strToU8(JSON.stringify(payload, null, 2));
}

/** v4.3 M2：场景包样例（安装/内容快照测试共用） */
export function buildSampleScenePack(): Uint8Array {
  return buildSampleZip(
    {
      id: 'com.example.sample.scene-pack',
      version: '1.0.0',
      kind: 'scene-pack',
      name: '示例场景包',
      description: '安装后增加一段可触发的场景；停用即移除。',
      permissions: ['scene:pack'],
      entry: 'payload/scene-pack.json',
      dependencies: [],
    },
    [{ path: 'payload/scene-pack.json', bytes: sampleScenePackPayload() }],
  );
}
