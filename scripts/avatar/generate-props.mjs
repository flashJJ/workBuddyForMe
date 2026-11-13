/**
 * 生成 S2 道具占位资产（项目自建，CC0-1.0）。
 *
 * 产物：apps/web/public/props/{teacup,bowl,book}.glb
 * 约定：Y 轴向上、单位米；茶杯原点在杯心，碗原点在碗底中心，书原点在书心。
 * 后续替换为外部 CC0 GLB 时只需覆盖同名文件并更新 manifest，不影响运行时。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter 的二进制导出依赖 FileReader；Node 24 只有 Blob
class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}
globalThis.FileReader = NodeFileReader;

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', '..', 'apps', 'web', 'public', 'props');

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.02, ...options });
}

function teacup() {
  const group = new THREE.Group();
  group.name = 'prop-teacup';
  const ceramic = material(0xf1ece3);
  const tea = material(0x8a5a32, { roughness: 0.3 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, 0.08, 20), ceramic);
  group.add(body);
  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.042, 20), tea);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.036;
  group.add(surface);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, 8, 18), ceramic);
  handle.position.x = -0.051;
  group.add(handle);
  return group;
}

function bowl() {
  const group = new THREE.Group();
  group.name = 'prop-bowl';
  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.03, 0),
    new THREE.Vector2(0.055, 0.006),
    new THREE.Vector2(0.075, 0.02),
    new THREE.Vector2(0.085, 0.04),
    new THREE.Vector2(0.088, 0.05),
  ];
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(points, 24),
    material(0xdfd8cc, { side: THREE.DoubleSide, roughness: 0.7 }),
  );
  group.add(mesh);
  return group;
}

function book() {
  const group = new THREE.Group();
  group.name = 'prop-book';
  const cover = material(0x6b4f3a);
  const pages = material(0xf2eadb, { roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.006), cover);
  back.position.z = -0.008;
  group.add(back);
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.15, 0.014), pages);
  group.add(block);
  // 封面枢轴放在书脊（左侧），运行时绕 Y 开合
  const coverPivot = new THREE.Group();
  coverPivot.name = 'book-cover';
  coverPivot.position.set(-0.06, 0, 0.008);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.006), cover);
  front.position.x = 0.06;
  coverPivot.add(front);
  group.add(coverPivot);
  return group;
}

function table() {
  const group = new THREE.Group();
  group.name = 'prop-table';
  const wood = material(0x8a6440);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.28), wood);
  top.position.y = 0.33;
  group.add(top);
  const legGeometry = new THREE.BoxGeometry(0.03, 0.33, 0.03);
  for (const [x, z] of [
    [-0.18, -0.11],
    [0.18, -0.11],
    [-0.18, 0.11],
    [0.18, 0.11],
  ]) {
    const leg = new THREE.Mesh(legGeometry, wood);
    leg.position.set(x, 0.165, z);
    group.add(leg);
  }
  return group;
}

async function exportGlb(name, object) {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(object, { binary: true });
  const buffer = Buffer.from(result);
  await writeFile(path.join(outDir, `${name}.glb`), buffer);
  console.log(`${name}.glb ${(buffer.byteLength / 1024).toFixed(1)} KB`);
}

await mkdir(outDir, { recursive: true });
await exportGlb('teacup', teacup());
await exportGlb('bowl', bowl());
await exportGlb('book', book());
await exportGlb('table', table());
