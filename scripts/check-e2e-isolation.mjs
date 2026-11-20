#!/usr/bin/env node
/**
 * E2E 隔离门禁：每个 spec 文件必须在 beforeAll 调用 resetE2eData。
 *
 * 所有 spec 共用一个数据根，隔离依赖 `POST /api/testing/reset`（见 tests/e2e/reset.ts）。
 * 新增 spec 若忘记重置，会重新引入「顺序依赖 + 重试必败」类问题（B-03/04/47/48），
 * 因此把它变成硬门禁，而不是靠 review 记住。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'e2e');
const MARK = 'resetE2eData';

const specs = readdirSync(DIR).filter((name) => name.endsWith('.spec.ts'));
const missing = specs.filter((name) => !readFileSync(join(DIR, name), 'utf8').includes(MARK));

if (missing.length > 0) {
  console.error(`E2E 隔离门禁失败：${missing.length}/${specs.length} 个 spec 未调用 ${MARK}()`);
  for (const name of missing) console.error(`  tests/e2e/${name}`);
  console.error('处理：在文件顶部 `test.beforeAll(async ({ request }) => resetE2eData(request));`');
  process.exit(1);
}

console.log(`E2E 隔离门禁通过：${specs.length} 个 spec 均在文件级重置数据`);
