#!/usr/bin/env node
/**
 * 循环依赖门禁（v2.16 M5）
 *
 * 扫描 apps/web/src、apps/desktop/src、packages/<pkg>/src，构建模块级 import 图，
 * 用 Tarjan 求强连通分量（SCC，规模 ≥2）。基线见 scripts/.cycles-baseline.json：
 * - SCC 模块集合与基线一致 → 存量，打印提示；
 * - 未登记的新 SCC → error，阻断。
 *
 * 用法：
 *   node scripts/check-cycles.mjs             # 常规检查
 *   node scripts/check-cycles.mjs --report    # 打印当前 SCC（生成基线用）
 *   node scripts/check-cycles.mjs --self-test # 内置自测
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '..');
const BASELINE_NAME = '.cycles-baseline.json';
const IGNORED_DIR_NAMES = new Set(['node_modules', 'dist', '.next', 'out', 'coverage', 'release', '.turbo', 'test-results', 'playwright-report']);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

function toRel(root, file) {
  return relative(root, file).split(sep).join('/');
}

function resolveFile(base) {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function loadPackageExports(root) {
  const map = new Map();
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return map;
  for (const pkg of readdirSync(packagesDir)) {
    const pkgJson = join(packagesDir, pkg, 'package.json');
    if (!existsSync(pkgJson)) continue;
    const parsed = JSON.parse(readFileSync(pkgJson, 'utf8'));
    const exportsField = parsed.exports ?? {};
    for (const [key, value] of Object.entries(exportsField)) {
      if (key === './package.json') continue;
      const types = typeof value === 'string' ? value : value?.types;
      if (!types) continue;
      const spec = key === '.' ? `@wbfm/${pkg}` : `@wbfm/${pkg}/${key.replace(/^\.\//, '')}`;
      const abs = join(packagesDir, pkg, types.replace(/^\.\//, ''));
      map.set(spec, abs);
    }
  }
  return map;
}

function resolveSpec(spec, importerFile, root, packageMap) {
  if (packageMap.has(spec)) return packageMap.get(spec);
  let base = null;
  if (spec.startsWith('@/')) base = join(root, 'apps', 'web', 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(importerFile), spec);
  else return null;
  return resolveFile(base);
}

export function buildGraph(root) {
  const webSrc = join(root, 'apps', 'web', 'src');
  const desktopSrc = join(root, 'apps', 'desktop', 'src');
  const packagesDir = join(root, 'packages');
  const sources = [webSrc, desktopSrc];
  if (existsSync(packagesDir)) {
    for (const pkg of readdirSync(packagesDir)) {
      const src = join(packagesDir, pkg, 'src');
      if (existsSync(src)) sources.push(src);
    }
  }
  const modules = sources.flatMap((dir) => walk(dir));
  const moduleSet = new Set(modules);
  const packageMap = loadPackageExports(root);
  const graph = new Map();
  let edges = 0;
  for (const file of modules) {
    const content = readFileSync(file, 'utf8');
    const deps = new Set();
    for (const match of content.matchAll(/from\s+'([^']+)'/g)) {
      const target = resolveSpec(match[1], file, root, packageMap);
      if (target && moduleSet.has(target) && target !== file) {
        deps.add(target);
        edges += 1;
      }
    }
    graph.set(file, [...deps]);
  }
  return { modules, graph, edges };
}

/** Tarjan SCC */
export function findSccs(graph) {
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const sccs = [];

  const strongConnect = (node) => {
    indices.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) {
        strongConnect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), indices.get(next)));
      }
    }
    if (low.get(node) === indices.get(node)) {
      const component = [];
      let current;
      do {
        current = stack.pop();
        onStack.delete(current);
        component.push(current);
      } while (current !== node);
      if (component.length >= 2) sccs.push(component);
    }
  };

  for (const node of graph.keys()) {
    if (!indices.has(node)) strongConnect(node);
  }
  return sccs;
}

function loadBaseline(root) {
  const file = join(root, 'scripts', BASELINE_NAME);
  if (!existsSync(file)) return { cycles: [] };
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function runCheck(root) {
  const { modules, graph, edges } = buildGraph(root);
  const sccs = findSccs(graph).map((component) => component.map((file) => toRel(root, file)).sort());
  sccs.sort((a, b) => b.length - a.length);
  const baseline = loadBaseline(root);
  const signatures = new Map(baseline.cycles.map((item) => [item.modules.slice().sort().join('|'), item]));
  const errors = [];
  const legacy = [];
  for (const component of sccs) {
    const signature = component.join('|');
    if (signatures.has(signature)) legacy.push({ component, entry: signatures.get(signature) });
    else errors.push({ component });
  }
  return { modules: modules.length, edges, sccs, legacy, errors };
}

function printReport(result) {
  console.log(`模块 ${result.modules}、依赖边 ${result.edges}、SCC ${result.sccs.length}`);
  result.sccs.forEach((component, i) => {
    console.log(`\n#${i + 1}  规模 ${component.length}`);
    for (const file of component) console.log(`  ${file}`);
  });
}

function printLegacy(legacy) {
  if (legacy.length === 0) return;
  console.log(`\n存量循环（已登记，不阻断）：${legacy.length}`);
  for (const { component, entry } of legacy) {
    console.log(`  规模 ${component.length}  ${entry.id}：${entry.reason}`);
  }
}

function printViolations(errors) {
  console.error(`\n发现 ${errors.length} 个未登记循环依赖（M5 门禁）：`);
  for (const { component } of errors) {
    console.error(`  规模 ${component.length}`);
    for (const file of component) console.error(`    ${file}`);
  }
  console.error('\n处理：拆分 barrel 反向导入或把共享类型上移；确属类型环/barrel 环的，登记到 scripts/.cycles-baseline.json。');
}

function selfTest() {
  const temp = mkdtempSync(join(tmpdir(), 'wbfm-cycles-'));
  try {
    const src = join(temp, 'apps', 'web', 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'a.ts'), "import { b } from './b';\nexport const a = b;\n");
    writeFileSync(join(src, 'b.ts'), "import { a } from './a';\nexport const b = a;\n");
    writeFileSync(join(src, 'c.ts'), "import { a } from './a';\nexport const c = a;\n");
    const scripts = join(temp, 'scripts');
    mkdirSync(scripts, { recursive: true });
    writeFileSync(join(scripts, BASELINE_NAME), JSON.stringify({ cycles: [] }));
    const result = runCheck(temp);
    if (result.errors.length !== 1) throw new Error(`自测失败：应检出 1 个循环，实际 ${result.errors.length}`);
    if (result.errors[0].component.length !== 2) {
      throw new Error(`自测失败：循环规模应为 2，实际 ${result.errors[0].component.length}`);
    }
    writeFileSync(
      join(scripts, BASELINE_NAME),
      JSON.stringify({ cycles: [{ id: 'T1', modules: result.errors[0].component, reason: '自测' }] }),
    );
    const second = runCheck(temp);
    if (second.errors.length !== 0 || second.legacy.length !== 1) {
      throw new Error(`自测失败：基线登记后应放行，实际 ${JSON.stringify(second)}`);
    }
    console.log('check-cycles 自测通过（检出循环 + 基线登记放行）');
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
  printLegacy(result.legacy);
  if (result.errors.length > 0) {
    printViolations(result.errors);
    process.exit(1);
  }
  console.log(`循环依赖检查通过：SCC ${result.sccs.length} 个，均已在基线登记。`);
}
