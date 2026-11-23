/**
 * v4.3 资产体积预算检查：模型、贴图、morph 快照与安装包。
 *
 * 用法：
 *   node scripts/assets/check-assets.mjs
 *   node scripts/assets/check-assets.mjs --write-snapshot
 *   node scripts/assets/check-assets.mjs --archive-dir J:\builds\archive --json .tmp\assets.json
 *
 * 退出码：0 通过（允许警告）；1 有超限或快照不一致。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, imageBytes, morphSignature, boneCount } from './lib/glb.mjs';
import { imageSize, imageMime } from './lib/image-size.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MODELS = path.join(ROOT, 'apps/web/public/vrm/models');
const DEFAULT_BUDGET = path.join(ROOT, 'scripts/assets/asset-budget.json');
const DEFAULT_SNAPSHOT = path.join(ROOT, 'scripts/assets/morph-snapshots.json');
const DEFAULT_ARCHIVE = process.env.WBFM_ARCHIVE_DIR ?? 'J:\\builds\\archive';
const MB = 1024 * 1024;

function parseArgs(argv) {
  const args = {
    modelsDir: DEFAULT_MODELS,
    budget: DEFAULT_BUDGET,
    snapshot: DEFAULT_SNAPSHOT,
    archiveDir: DEFAULT_ARCHIVE,
    writeSnapshot: false,
    json: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--models') args.modelsDir = path.resolve(argv[(i += 1)]);
    else if (arg === '--budget') args.budget = path.resolve(argv[(i += 1)]);
    else if (arg === '--snapshot') args.snapshot = path.resolve(argv[(i += 1)]);
    else if (arg === '--archive-dir') args.archiveDir = path.resolve(argv[(i += 1)]);
    else if (arg === '--json') args.json = path.resolve(argv[(i += 1)]);
    else if (arg === '--write-snapshot') args.writeSnapshot = true;
    else if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`);
  }
  return args;
}

function mb(bytes) {
  return Number((bytes / MB).toFixed(2));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function textureCategory(name) {
  return /(normal|orm|rough|metal|ao|occlusion|mask|matcap)/i.test(name) ? 'data' : 'color';
}

function scanTextures(file, glb, budget) {
  const problems = [];
  const warnings = [];
  const images = glb.json.images ?? [];
  let maxWidth = 0;
  let maxHeight = 0;
  for (const [index, image] of images.entries()) {
    const bytes = imageBytes(glb.json, glb.bin, image);
    if (!bytes) {
      problems.push(`image[${index}] 无法读取字节`);
      continue;
    }
    const mime = image.mimeType ?? imageMime(bytes);
    const size = imageSize(bytes);
    if (size) {
      maxWidth = Math.max(maxWidth, size.width);
      maxHeight = Math.max(maxHeight, size.height);
    }
    const category = textureCategory(image.name ?? '');
    const maxSize = category === 'data' ? budget.dataMaxSize : budget.colorMaxSize;
    const targetSize = category === 'data' ? budget.dataTargetSize : budget.colorTargetSize;
    const formats = category === 'data' ? budget.dataFormats : budget.colorFormats;
    const label = image.name ?? '(未命名)';
    if (!mime || !formats.includes(mime)) {
      problems.push(`image[${index}] ${label} 格式 ${mime ?? '未知'} 不在 ${formats.join('/')}`);
    } else if (budget.preferredFormat && mime !== budget.preferredFormat) {
      warnings.push(`image[${index}] ${label} 使用 ${mime}，目标格式 ${budget.preferredFormat}`);
    }
    if (!size) {
      problems.push(`image[${index}] ${label} 无法读取尺寸`);
    } else if (size.width > maxSize || size.height > maxSize) {
      problems.push(`image[${index}] ${label} ${size.width}x${size.height} 超过上限 ${maxSize}`);
    } else if (size.width > targetSize || size.height > targetSize) {
      warnings.push(`image[${index}] ${label} ${size.width}x${size.height} 超过目标 ${targetSize}`);
    }
  }
  return { file, count: images.length, maxWidth, maxHeight, problems, warnings };
}

function scanModel(file, budget, snapshot) {
  const bytes = fs.statSync(file).size;
  const glb = readGlb(file);
  const morph = morphSignature(glb.json);
  const bone = boneCount(glb.json);
  const signature = crypto.createHash('sha256').update(morph.text).digest('hex');
  const textures = scanTextures(file, glb, budget.textures);
  const problems = [...textures.problems];
  const warnings = [...textures.warnings];
  if (bytes > budget.models.maxFileMb * MB) {
    problems.push(`体积 ${mb(bytes)}MB 超过 ${budget.models.maxFileMb}MB`);
  }
  const expected = snapshot.models[path.basename(file)];
  if (!expected) {
    problems.push('morph 快照未登记，确认后运行 --write-snapshot');
  } else {
    if (expected.signature !== signature) problems.push('morph 顺序/数量与快照不一致');
    if (expected.morphCount !== morph.morphCount) {
      problems.push(`morph 数 ${morph.morphCount} ≠ 快照 ${expected.morphCount}`);
    }
    if (expected.boneCount !== null && bone !== expected.boneCount) {
      problems.push(`骨骼数 ${bone} ≠ 快照 ${expected.boneCount}`);
    }
  }
  return {
    file: path.basename(file),
    bytes,
    textures,
    morphCount: morph.morphCount,
    signature,
    boneCount: bone,
    problems,
    warnings,
  };
}

function semverParts(name) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(name);
  return match ? match.slice(1).map(Number) : null;
}

function scanInstaller(archiveDir, budget) {
  if (!fs.existsSync(archiveDir)) {
    return { skipped: true, message: `归档目录不存在：${archiveDir}` };
  }
  const versions = fs
    .readdirSync(archiveDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && semverParts(entry.name))
    .map((entry) => ({ name: entry.name, parts: semverParts(entry.name), dir: path.join(archiveDir, entry.name) }))
    .sort((a, b) => {
      for (let i = 0; i < 3; i += 1) if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
      return 0;
    });
  const withExe = versions
    .map((version) => {
      const exe = fs
        .readdirSync(version.dir)
        .filter((name) => name.toLowerCase().endsWith('.exe'))
        .map((name) => ({ name, bytes: fs.statSync(path.join(version.dir, name)).size }))
        .sort((a, b) => b.bytes - a.bytes)[0];
      return exe ? { version: version.name, exe } : null;
    })
    .filter(Boolean);
  if (withExe.length === 0) {
    return { skipped: true, message: `归档目录没有 exe：${archiveDir}` };
  }
  const latest = withExe[withExe.length - 1];
  const previous = withExe.length > 1 ? withExe[withExe.length - 2] : null;
  const problems = [];
  if (latest.exe.bytes > budget.installer.maxMb * MB) {
    problems.push(`最新安装包 ${mb(latest.exe.bytes)}MB 超过 ${budget.installer.maxMb}MB`);
  }
  return { skipped: false, latest, previous, problems };
}

function writeSnapshot(file, models) {
  const data = {
    version: 1,
    models: Object.fromEntries(
      [...models]
        .sort((a, b) => a.file.localeCompare(b.file))
        .map((model) => [
          model.file,
          {
            morphCount: model.morphCount,
            signature: model.signature,
            boneCount: model.boneCount,
          },
        ]),
    ),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function printModel(model) {
  const textureText =
    model.textures.count === 0
      ? '无贴图'
      : `${model.textures.count} 张，最大 ${model.textures.maxWidth}x${model.textures.maxHeight}`;
  console.log(
    `  ${model.file}: ${mb(model.bytes)}MB / ${model.morphCount} morph / ${model.boneCount ?? '—'} 骨骼 / ${textureText}`,
  );
  for (const problem of model.problems) console.log(`    ✗ ${problem}`);
  for (const warning of model.warnings) console.log(`    ! ${warning}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const budget = readJson(args.budget);
  const files = fs
    .readdirSync(args.modelsDir)
    .filter((name) => /\.(vrm|glb)$/i.test(name))
    .sort()
    .map((name) => path.join(args.modelsDir, name));
  const emptySnapshot = { version: 1, models: {} };
  let snapshot = fs.existsSync(args.snapshot) ? readJson(args.snapshot) : emptySnapshot;
  let models = files.map((file) => scanModel(file, budget, snapshot));

  if (args.writeSnapshot) {
    writeSnapshot(args.snapshot, models);
    console.log(`已写入 morph 快照：${args.snapshot}`);
    snapshot = readJson(args.snapshot);
    models = files.map((file) => scanModel(file, budget, snapshot));
  }

  const violations = [];
  const totalBytes = models.reduce((sum, model) => sum + model.bytes, 0);
  if (totalBytes > budget.models.maxTotalMb * MB) {
    violations.push(`内置模型合计 ${mb(totalBytes)}MB 超过 ${budget.models.maxTotalMb}MB`);
  }
  for (const model of models) for (const problem of model.problems) violations.push(`${model.file}: ${problem}`);

  const snapshotModels = new Set(models.map((model) => model.file));
  for (const name of Object.keys(snapshot.models)) {
    if (!snapshotModels.has(name)) violations.push(`快照包含已不存在的模型：${name}`);
  }

  const installer = scanInstaller(args.archiveDir, budget);
  if (!installer.skipped) {
    for (const problem of installer.problems) violations.push(problem);
  }

  console.log('资产预算检查');
  console.log(`模型目录：${args.modelsDir}`);
  for (const model of models) printModel(model);
  console.log(`  合计：${mb(totalBytes)}MB / ${budget.models.maxTotalMb}MB`);
  for (const model of models) {
    if (model.textures.problems.length === 0) {
      console.log(`  ${model.file} 贴图预算：PASS（${model.textures.count} 张）`);
    }
  }
  if (installer.skipped) {
    console.log(`安装包：跳过（${installer.message}）`);
  } else {
    const previous = installer.previous
      ? `，上一版 ${installer.previous.version} ${mb(installer.previous.exe.bytes)}MB`
      : '';
    console.log(
      `安装包：最新 ${installer.latest.version} ${mb(installer.latest.exe.bytes)}MB / ${budget.installer.maxMb}MB${previous}`,
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    models: models.map((model) => ({
      file: model.file,
      bytes: model.bytes,
      morphCount: model.morphCount,
      boneCount: model.boneCount,
      textures: {
        count: model.textures.count,
        maxWidth: model.textures.maxWidth,
        maxHeight: model.textures.maxHeight,
      },
      problems: model.problems,
      warnings: model.warnings,
    })),
    totalBytes,
    installer: installer.skipped ? { skipped: true, message: installer.message } : installer,
    violations,
  };
  if (args.json) {
    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`报告：${args.json}`);
  }

  if (violations.length > 0) {
    console.error(`\nFAIL：${violations.length} 项超限/不一致`);
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }
  console.log('\nPASS：资产预算与 morph 快照均通过');
}

main();
