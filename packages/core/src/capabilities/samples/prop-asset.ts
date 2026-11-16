/**
 * v4.3 M3：示例道具 GLB（项目自建，CC0-1.0）。
 *
 * 程序化生成一个 7cm 立方体，不依赖外部资产；使用 KHR_materials_unlit，
 * 无需光照即可在桌宠场景中辨认。仅用于示例道具包与测试。
 */

const HALF = 0.035;

function positions(): number[] {
  const corners: Array<[number, number, number]> = [
    [-HALF, -HALF, -HALF],
    [HALF, -HALF, -HALF],
    [HALF, HALF, -HALF],
    [-HALF, HALF, -HALF],
    [-HALF, -HALF, HALF],
    [HALF, -HALF, HALF],
    [HALF, HALF, HALF],
    [-HALF, HALF, HALF],
  ];
  return corners.flat();
}

const INDICES = [
  4, 5, 6, 4, 6, 7, 0, 3, 2, 0, 2, 1, 1, 2, 6, 1, 6, 5,
  0, 4, 7, 0, 7, 3, 3, 7, 6, 3, 6, 2, 0, 1, 5, 0, 5, 4,
];

function buildSamplePropGlb(): Uint8Array {
  const positionBytes = new Float32Array(positions());
  const indexBytes = new Uint16Array(INDICES);
  const bin = new Uint8Array(positionBytes.byteLength + indexBytes.byteLength);
  bin.set(new Uint8Array(positionBytes.buffer), 0);
  bin.set(new Uint8Array(indexBytes.buffer), positionBytes.byteLength);

  const json = {
    asset: { version: '2.0', generator: 'wbfm-prop-pack-sample' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'wbfm-sample-cube', mesh: 0 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.56, 0.78, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 0.5,
        },
        extensions: { KHR_materials_unlit: {} },
        doubleSided: true,
      },
    ],
    extensionsUsed: ['KHR_materials_unlit'],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionBytes.byteLength,
        byteLength: indexBytes.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: 'VEC3',
        min: [-HALF, -HALF, -HALF],
        max: [HALF, HALF, HALF],
      },
      { bufferView: 1, componentType: 5123, count: INDICES.length, type: 'SCALAR' },
    ],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = (jsonBytes.byteLength + 3) & ~3;
  const total = 12 + 8 + jsonLength + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  const binStart = 20 + jsonLength;
  view.setUint32(binStart, bin.byteLength, true);
  view.setUint32(binStart + 4, 0x004e4942, true);
  out.set(bin, binStart + 8);
  return out;
}

export const SAMPLE_PROP_GLB = buildSamplePropGlb();
