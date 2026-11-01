#!/usr/bin/env node
/**
 * 结构门禁（v2.16 M5）
 *
 * 三类检查：
 * 1. 目录预算：任一手写源码目录直接 .ts/.tsx ≤12；存量超标登记为 warning，新增/增长为 error。
 * 2. 公开入口：多文件 web feature 必须有 `index.ts`；单文件豁免。
 * 3. 引用边界：跨 feature 只能引用公开入口（根或子域 barrel），禁止深文件；
 *    客户端 feature 不得引用 `lib/server`；禁止从自身 barrel 反向导入。
 *
 * 基线：scripts/.structure-baseline.json（存量超标目录与例外引用逐条登记）。
 *
 * 用法：
 *   node scripts/check-structure.mjs             # 常规检查
 *   node scripts/check-structure.mjs --report    # 打印当前存量（生成基线用）
 *   node scripts/check-structure.mjs --self-test # 内置自测
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '..');
const BASELINE_NAME = '.structure-baseline.json';
const BUDGET = 12;
const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  'out',
  'coverage',
  'release',
  '.turbo',
  'test-results',
  'playwright-report',
]);

function scanSources(root) {
  return [
    { root: join(root, 'apps', 'web', 'src'), label: 'web' },
    { root: join(root, 'apps', 'desktop', 'src'), label: 'desktop' },
    { root: join(root, 'packages'), label: 'packages', packageSrc: true },
  ];
}

function isSourceFile(name) {
  return (name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.d.ts');
}

function isTestFile(rel) {
  return (
    /\.(test|spec)\.(ts|tsx)$/.test(rel) ||
    rel.split(sep).includes('__tests__') ||
    rel.split(sep).includes('__mocks__')
  );
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (isSourceFile(entry)) acc.push(full);
  }
  return acc;
}

/** 收集源码文件（packages 只扫各包 src） */
function collectSourceFiles(config) {
  if (config.packageSrc) {
    const packagesDir = config.root;
    const files = [];
    if (!existsSync(packagesDir)) return files;
    for (const pkg of readdirSync(packagesDir)) {
      const src = join(packagesDir, pkg, 'src');
      if (existsSync(src)) walk(src, files);
    }
    return files;
  }
  return walk(config.root);
}

function loadBaseline(root) {
  const file = join(root, 'scripts', BASELINE_NAME);
  if (!existsSync(file)) {
    return { budget: BUDGET, exemptDirs: [], legacyDirs: [], legacyEntries: [], deepImportExemptions: [] };
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function toRel(root, file) {
  return relative(root, file).split(sep).join('/');
}

/** 1. 目录预算 */
function checkDirectoryBudget(files, baseline, root) {
  const counts = new Map();
  for (const file of files) {
    const dir = toRel(root, dirname(file));
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  const exempt = new Map(baseline.exemptDirs.map((item) => [item.path, item.reason]));
  const legacy = new Map(baseline.legacyDirs.map((item) => [item.path, item.count]));
  const errors = [];
  const warnings = [];
  for (const [dir, count] of counts) {
    if (count <= baseline.budget) continue;
    if (exempt.has(dir)) continue;
    if (legacy.has(dir)) {
      if (count > legacy.get(dir)) {
        errors.push({ code: 'DIR_GROWTH', dir, count, base: legacy.get(dir) });
      } else {
        warnings.push({ code: 'DIR_LEGACY', dir, count });
      }
      continue;
    }
    errors.push({ code: 'DIR_NEW_BUDGET', dir, count });
  }
  return { errors, warnings, counts };
}

/** 2. 公开入口 */
function checkFeatureEntries(baseline, root) {
  const featuresDir = join(root, 'apps', 'web', 'src', 'features');
  const errors = [];
  const warnings = [];
  const missing = [];
  if (!existsSync(featuresDir)) return { errors, warnings, missing };
  for (const entry of readdirSync(featuresDir)) {
    const dir = join(featuresDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    const files = walk(dir);
    const modules = files.filter((file) => !isTestFile(toRel(root, file)));
    if (modules.length <= 1) continue;
    if (existsSync(join(dir, 'index.ts'))) continue;
    missing.push(`apps/web/src/features/${entry}`);
  }
  const legacy = new Map(baseline.legacyEntries.map((item) => [item.path, item.reason]));
  for (const path of missing) {
    if (legacy.has(path)) warnings.push({ code: 'ENTRY_LEGACY', path });
    else errors.push({ code: 'ENTRY_MISSING', path });
  }
  return { errors, warnings, missing };
}

const ALIAS_PREFIX = '@/';

/** 把模块说明符解析到真实文件：优先文件，其次目录 index.ts */
function resolveModule(spec, importerFile, webSrc) {
  let base;
  if (spec.startsWith('@/')) base = join(webSrc, spec.slice(ALIAS_PREFIX.length));
  else if (spec.startsWith('.')) base = resolve(dirname(importerFile), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return base;
}

function isEntryFile(file) {
  return file.endsWith(`${sep}index.ts`); // 只接受 index.ts（index.tsx 不允许作为入口）
}

function featureOf(featuresDir, absPath) {
  const rel = relative(featuresDir, absPath);
  if (!rel.startsWith('..') && !rel.startsWith(sep)) return rel.split(sep)[0];
  return null;
}

/** 3. 引用边界 */
function checkImports(root, baseline) {
  const webSrc = join(root, 'apps', 'web', 'src');
  const featuresDir = join(webSrc, 'features');
  const files = walk(webSrc);
  const errors = [];
  const warnings = [];
  const exemptions = baseline.deepImportExemptions ?? [];
  if (exemptions.length > 10) {
    errors.push({ code: 'DEEP_EXEMPTION_BUDGET', count: exemptions.length });
  }
  const exemptionSet = new Set(exemptions.map((item) => `${item.file}|${item.spec}`));
  const usedExemptions = new Set();

  for (const file of files) {
    const rel = toRel(root, file);
    const isTest = isTestFile(rel);
    const content = readFileSync(file, 'utf8');
    const importerFeature = featureOf(featuresDir, file);
    for (const match of content.matchAll(/from\s+'([^']+)'/g)) {
      const spec = match[1];
      const target = spec.startsWith('@/features/') || spec.startsWith('.') ? resolveModule(spec, file, webSrc) : null;
      if (target) {
        const targetFeature = featureOf(featuresDir, target);
        if (targetFeature && targetFeature !== importerFeature) {
          if (!isEntryFile(target)) {
            const key = `${rel}|${spec}`;
            if (isTest) continue;
            if (exemptionSet.has(key)) usedExemptions.add(key);
            else errors.push({ code: 'DEEP_IMPORT', file: rel, spec });
          }
        } else if (targetFeature && targetFeature === importerFeature && spec.startsWith('@/features/')) {
          if (!isTest) errors.push({ code: 'SELF_BARREL', file: rel, spec });
        }
      }

      if (spec.startsWith('@/lib/hooks/')) {
        const rest = spec.slice('@/lib/hooks/'.length);
        const hooksTarget = resolveModule(spec, file, webSrc);
        if (rest.includes('/') && hooksTarget && !isEntryFile(hooksTarget)) {
          const key = `${rel}|${spec}`;
          if (isTest) continue;
          if (exemptionSet.has(key)) usedExemptions.add(key);
          else errors.push({ code: 'HOOK_DEEP_IMPORT', file: rel, spec });
        }
      }

      if (spec.startsWith('@/lib/server/') && importerFeature && !isTest) {
        errors.push({ code: 'CLIENT_SERVER_IMPORT', file: rel, spec });
      }
    }
  }

  for (const item of exemptions) {
    if (!usedExemptions.has(`${item.file}|${item.spec}`)) {
      warnings.push({ code: 'DEEP_EXEMPTION_STALE', file: item.file, spec: item.spec });
    }
  }
  return { errors, warnings };
}

export function runCheck(root) {
  const baseline = loadBaseline(root);
  const files = scanSources(root).flatMap((config) => collectSourceFiles(config));
  const budget = checkDirectoryBudget(files, baseline, root);
  const entries = checkFeatureEntries(baseline, root);
  const imports = checkImports(root, baseline);
  return {
    counts: budget.counts,
    missingEntries: entries.missing,
    errors: [...budget.errors, ...entries.errors, ...imports.errors],
    warnings: [...budget.warnings, ...entries.warnings, ...imports.warnings],
  };
}

function printReport(result) {
  const over = [...result.counts.entries()]
    .filter(([, count]) => count > BUDGET)
    .sort((a, b) => b[1] - a[1]);
  console.log(`超标目录（>${BUDGET}）：${over.length}`);
  for (const [dir, count] of over) console.log(`  ${count}  ${dir}`);
  console.log(`缺失入口的多文件 feature：${result.missingEntries.length}`);
  for (const path of result.missingEntries) console.log(`  ${path}`);
}

function printWarnings(warnings) {
  if (warnings.length === 0) return;
  console.log(`\n存量提示（不阻断）：${warnings.length}`);
  for (const w of warnings) {
    if (w.code === 'DIR_LEGACY') console.log(`  [目录存量] ${w.count} 个直接文件  ${w.dir}`);
    else if (w.code === 'ENTRY_LEGACY') console.log(`  [入口存量] ${w.path}`);
    else if (w.code === 'DEEP_EXEMPTION_STALE') console.log(`  [例外失效] ${w.file} -> ${w.spec}`);
  }
  console.log('存量按基线冻结，新代码不得继续增长；到期版本复核。');
}

function printViolations(errors) {
  console.error(`\n结构门禁失败：${errors.length} 项`);
  for (const e of errors) {
    if (e.code === 'DIR_NEW_BUDGET') console.error(`  [新增超标] ${e.dir} 直接文件 ${e.count} > ${BUDGET}`);
    else if (e.code === 'DIR_GROWTH') console.error(`  [存量增长] ${e.dir} 由 ${e.base} 增至 ${e.count}（预算 ${BUDGET}）`);
    else if (e.code === 'ENTRY_MISSING') console.error(`  [缺少入口] ${e.path}（多文件 feature 必须有 index.ts）`);
    else if (e.code === 'DEEP_IMPORT') console.error(`  [跨域深引用] ${e.file} -> ${e.spec}`);
    else if (e.code === 'SELF_BARREL') console.error(`  [自身 barrel 反向导入] ${e.file} -> ${e.spec}`);
    else if (e.code === 'HOOK_DEEP_IMPORT') console.error(`  [hooks 深引用] ${e.file} -> ${e.spec}`);
    else if (e.code === 'CLIENT_SERVER_IMPORT') console.error(`  [客户端引用服务端] ${e.file} -> ${e.spec}`);
    else if (e.code === 'DEEP_EXEMPTION_BUDGET') console.error(`  [例外超限] 允许最多 10 条，当前 ${e.count}`);
    else console.error(`  [${e.code}] ${JSON.stringify(e)}`);
  }
  console.error('\n处理：按能力建子域 barrel；确需例外时在 scripts/.structure-baseline.json 登记 reason 与到期版本。');
}

function selfTest() {
  const temp = mkdtempSync(join(tmpdir(), 'wbfm-structure-'));
  try {
    const web = join(temp, 'apps', 'web', 'src');
    const featureA = join(web, 'features', 'alpha');
    const featureB = join(web, 'features', 'beta');
    mkdirSync(featureA, { recursive: true });
    mkdirSync(featureB, { recursive: true });
    const write = (file, content = 'export const x = 1;\n') => writeFileSync(file, content);
    write(join(featureA, 'index.ts'), "export { A } from './a';\n");
    write(join(featureA, 'a.ts'));
    write(join(featureA, 'b.ts'));
    write(join(featureA, 'c.ts'), "import { A } from '@/features/alpha';\nexport const C = A;\n");
    write(join(featureB, 'b.ts'), "import { A } from '@/features/alpha/a';\nexport const B = A;\n");
    write(join(featureB, 'index.ts'), "export { B } from './b';\n");
    const scripts = join(temp, 'scripts');
    mkdirSync(scripts, { recursive: true });
    writeFileSync(
      join(scripts, BASELINE_NAME),
      JSON.stringify({ budget: 12, exemptDirs: [], legacyDirs: [], legacyEntries: [], deepImportExemptions: [] }),
    );

    const result = runCheck(temp);
    const codes = result.errors.map((e) => e.code);
    if (!codes.includes('DEEP_IMPORT')) throw new Error(`自测失败：应检出跨域深引用，实际 ${JSON.stringify(result.errors)}`);
    if (!codes.includes('SELF_BARREL')) throw new Error(`自测失败：应检出自身 barrel 反向导入，实际 ${JSON.stringify(result.errors)}`);

    console.log('check-structure 自测通过（跨域深引用 + 自身 barrel 反向导入）');
    return true;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else if (process.argv.includes('--report')) {
  printReport(runCheck(ROOT));
} else {
  const result = runCheck(ROOT);
  printWarnings(result.warnings);
  if (result.errors.length > 0) {
    printViolations(result.errors);
    process.exit(1);
  }
  console.log(`结构检查通过：目录预算 ≤ ${BUDGET}、多文件 feature 均有入口、跨域仅引用公开入口。`);
}
