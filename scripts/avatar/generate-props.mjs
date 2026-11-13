/**
 * 生成桌宠道具资产（项目自建，CC0-1.0）。
 *
 * 产物：apps/web/public/props/{teacup,bowl,book,table,phone,flower,cushion,lamp}.glb
 * 约定：Y 轴向上、单位米；茶杯原点在杯心，碗原点在碗底中心，书原点在书心；
 * 手持道具（phone/flower）原点在握持中心，场景道具（table/cushion/lamp）原点在底部中心。
 * 后续替换为外部 CC0 GLB 时只需覆盖同名文件并更新 manifest，不影响运行时。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.03, ...options });
}

function roundedBox(width, height, depth, radius, mat, segments = 4) {
  return new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, segments, radius), mat);
}

function lathe(points, segments, mat) {
  return new THREE.Mesh(
    new THREE.LatheGeometry(
      points.map(([x, y]) => new THREE.Vector2(x, y)),
      segments,
    ),
    mat,
  );
}

/** 带内壁的杯子：外壁上升 → 越过杯沿 → 内壁下落 → 杯底 */
function teacup() {
  const group = new THREE.Group();
  group.name = 'prop-teacup';
  const ceramic = material(0xf4efe6, { roughness: 0.35, metalness: 0.02, side: THREE.DoubleSide });
  const tea = material(0x8a5a32, { roughness: 0.25 });

  const cup = lathe(
    [
      [0, 0],
      [0.03, 0],
      [0.034, 0.004],
      [0.041, 0.012],
      [0.047, 0.052],
      [0.048, 0.064],
      [0.045, 0.066],
      [0.042, 0.058],
      [0.036, 0.014],
      [0, 0.012],
    ],
    40,
    ceramic,
  );
  group.add(cup);

  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.039, 40), tea);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.052;
  group.add(surface);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 12, 28), ceramic);
  handle.position.set(-0.052, 0.036, 0);
  group.add(handle);
  return group;
}

function bowl() {
  const group = new THREE.Group();
  group.name = 'prop-bowl';
  const porcelain = material(0xe4ded2, { roughness: 0.42, side: THREE.DoubleSide });
  const soup = material(0xd9a05b, { roughness: 0.3 });

  const shell = lathe(
    [
      [0, 0],
      [0.026, 0],
      [0.03, 0.004],
      [0.058, 0.012],
      [0.08, 0.03],
      [0.088, 0.05],
      [0.089, 0.056],
      [0.085, 0.058],
      [0.08, 0.048],
      [0.07, 0.028],
      [0.03, 0.012],
      [0, 0.01],
    ],
    40,
    porcelain,
  );
  group.add(shell);

  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.072, 40), soup);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.038;
  group.add(surface);

  const foot = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.004, 10, 28), porcelain);
  foot.rotation.x = Math.PI / 2;
  foot.position.y = 0.002;
  group.add(foot);
  return group;
}

function book() {
  const group = new THREE.Group();
  group.name = 'prop-book';
  const coverMat = material(0x6b4f3a, { roughness: 0.55 });
  const pages = material(0xf2eadb, { roughness: 0.85 });
  const gilt = material(0xc9a25a, { roughness: 0.3, metalness: 0.45 });

  const back = roundedBox(0.12, 0.16, 0.008, 0.003, coverMat);
  back.position.z = -0.011;
  group.add(back);

  const block = roundedBox(0.112, 0.15, 0.016, 0.002, pages, 2);
  group.add(block);

  // 书脊：薄圆柱包住左侧
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 16), coverMat);
  spine.position.set(-0.058, 0, -0.003);
  group.add(spine);

  // 封面枢轴放在书脊（左侧），运行时绕 Y 开合
  const coverPivot = new THREE.Group();
  coverPivot.name = 'book-cover';
  coverPivot.position.set(-0.06, 0, 0.012);
  const front = roundedBox(0.12, 0.16, 0.008, 0.003, coverMat);
  front.position.x = 0.06;
  coverPivot.add(front);
  const band = roundedBox(0.02, 0.16, 0.002, 0.001, gilt, 2);
  band.position.set(0.06, 0, 0.005);
  coverPivot.add(band);
  group.add(coverPivot);
  return group;
}

function table() {
  const group = new THREE.Group();
  group.name = 'prop-table';
  const wood = material(0x9a6f47, { roughness: 0.5 });
  const darkWood = material(0x6f4c30, { roughness: 0.55 });

  const top = roundedBox(0.42, 0.028, 0.28, 0.012, wood);
  top.position.y = 0.33;
  group.add(top);

  const legGeometry = new THREE.CylinderGeometry(0.013, 0.016, 0.33, 12);
  for (const [x, z] of [
    [-0.18, -0.11],
    [0.18, -0.11],
    [-0.18, 0.11],
    [0.18, 0.11],
  ]) {
    const leg = new THREE.Mesh(legGeometry, darkWood);
    leg.position.set(x, 0.165, z);
    group.add(leg);
  }

  // 横撑：两根细杆，避免四条腿悬空感
  const braceGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.36, 10);
  for (const z of [-0.11, 0.11]) {
    const brace = new THREE.Mesh(braceGeometry, darkWood);
    brace.rotation.z = Math.PI / 2;
    brace.position.set(0, 0.1, z);
    group.add(brace);
  }
  return group;
}

function phone() {
  const group = new THREE.Group();
  group.name = 'prop-phone';
  const body = material(0x2b3038, { roughness: 0.35, metalness: 0.2 });
  const screen = material(0x9fd8ff, {
    roughness: 0.2,
    metalness: 0.05,
    emissive: new THREE.Color(0x2a6a99),
    emissiveIntensity: 0.7,
  });
  const camera = material(0x11151a, { roughness: 0.25, metalness: 0.4 });

  const shell = roundedBox(0.072, 0.148, 0.009, 0.01, body);
  group.add(shell);
  const glass = roundedBox(0.064, 0.132, 0.002, 0.008, screen, 3);
  glass.position.z = 0.0055;
  group.add(glass);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.005, 16), camera);
  lens.position.set(0.02, 0.062, 0.0066);
  group.add(lens);
  return group;
}

function flower() {
  const group = new THREE.Group();
  group.name = 'prop-flower';
  const stemMat = material(0x4f7a3a, { roughness: 0.7 });
  const petalMat = material(0xf2a7b8, { roughness: 0.5, side: THREE.DoubleSide });
  const centerMat = material(0xf3cc5c, { roughness: 0.45 });
  const leafMat = material(0x5c8a44, { roughness: 0.75, side: THREE.DoubleSide });

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.17, 10), stemMat);
  stem.position.y = 0.02;
  group.add(stem);

  for (const [side, y, angle] of [
    [-1, 0.005, 0.7],
    [1, -0.025, -0.6],
  ]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), leafMat);
    leaf.scale.set(1.6, 0.28, 0.6);
    leaf.position.set(side * 0.024, y, 0);
    leaf.rotation.z = angle;
    group.add(leaf);
  }

  const head = new THREE.Group();
  head.position.y = 0.115;
  group.add(head);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), petalMat);
    petal.scale.set(1.35, 0.4, 0.9);
    petal.position.set(Math.cos(angle) * 0.024, 0, Math.sin(angle) * 0.024);
    petal.rotation.y = -angle;
    head.add(petal);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 12), centerMat);
  head.add(core);
  return group;
}

function cushion() {
  const group = new THREE.Group();
  group.name = 'prop-cushion';
  const fabric = material(0xc98f7b, { roughness: 0.9 });
  const accent = material(0xa96f5c, { roughness: 0.9 });
  const body = roundedBox(0.34, 0.09, 0.32, 0.035, fabric, 5);
  body.position.y = 0.045;
  group.add(body);
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), accent);
  button.scale.y = 0.5;
  button.position.y = 0.092;
  group.add(button);
  return group;
}

function lamp() {
  const group = new THREE.Group();
  group.name = 'prop-lamp';
  const metal = material(0x4f555c, { roughness: 0.35, metalness: 0.55 });
  const shadeMat = material(0xf0d9a8, {
    roughness: 0.6,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0xf2c46b),
    emissiveIntensity: 0.35,
  });
  const bulbMat = material(0xffe6b0, {
    emissive: new THREE.Color(0xffcf7a),
    emissiveIntensity: 1.2,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.014, 24), metal);
  base.position.y = 0.007;
  group.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.26, 12), metal);
  pole.position.y = 0.145;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 10), metal);
  arm.rotation.z = Math.PI / 2.6;
  arm.position.set(0.045, 0.285, 0);
  group.add(arm);

  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.075, 0.085, 24, 1, true),
    shadeMat,
  );
  shade.position.set(0.095, 0.3, 0);
  group.add(shade);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 12), bulbMat);
  bulb.position.set(0.095, 0.268, 0);
  group.add(bulb);
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
await exportGlb('phone', phone());
await exportGlb('flower', flower());
await exportGlb('cushion', cushion());
await exportGlb('lamp', lamp());
