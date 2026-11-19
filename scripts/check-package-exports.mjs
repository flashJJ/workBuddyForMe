#!/usr/bin/env node
/**
 * v4.13：构建后包导出冒烟。
 *
 * 生产条件下域子路径指向 dist bundle，源码测试无法发现「根 barrel 漏聚合」。
 * 这里按各包 package.json 的 exports.import 解析真实产物，断言关键符号存在，
 * 防止 next start / standalone 运行期拿到 undefined。
 * 运行前提：core/shared 已 build（CI 在 pnpm build:web 之后执行）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  {
    pkgDir: 'packages/core',
    subpath: './context',
    names: ['recordSceneSnapshot', 'buildSceneSnapshot', 'estimateTokens'],
  },
  {
    pkgDir: 'packages/shared',
    subpath: './schemas',
    names: ['turnIntentSchema', 'detectTurnIntent', 'contextPlanSchema'],
  },
  {
    pkgDir: 'packages/shared',
    subpath: './api',
    names: ['SSE_EVENT'],
  },
  {
    pkgDir: 'packages/core',
    subpath: './event-client',
    names: ['EventRunner', 'EventDirector', 'evaluateEventConditions'],
  },
  {
    pkgDir: 'packages/core',
    subpath: './stage-client',
    names: ['adaptStageFrame', 'createAgentStageCast'],
  },
  {
    pkgDir: 'packages/core',
    subpath: './relationship-client',
    names: ['levelFromScore', 'isRelationshipUnlocked'],
  },
];

for (const check of checks) {
  const pkg = JSON.parse(readFileSync(join(ROOT, check.pkgDir, 'package.json'), 'utf-8'));
  const entry = pkg.exports?.[check.subpath]?.import;
  assert.ok(entry, `${check.pkgDir} 缺少 exports['${check.subpath}'].import`);
  const file = join(ROOT, check.pkgDir, entry);
  const mod = await import(pathToFileURL(file).href);
  for (const name of check.names) {
    assert.ok(
      typeof mod[name] !== 'undefined',
      `${relative(ROOT, file)} 缺少导出 ${name}（检查根 barrel 是否聚合该域，或 dist 是否已重建）`,
    );
  }
  console.log(`PASS ${check.pkgDir} ${check.subpath} → ${entry}（${check.names.length} 个符号）`);
}

console.log(`包导出冒烟通过：${checks.length} 个子路径。`);
