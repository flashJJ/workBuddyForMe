#!/usr/bin/env node
/**
 * v4.1 P0：陪伴质量离线报告（决策回放 + 12 组场景矩阵 + 指标汇总）。
 *
 * 只读打开本机 SQLite 的 settings_kv，读取决策/生成/日记/播放/调度五个键，
 * 不读取聊天正文、不写任何设置。报告默认写 docs/eval/companion-report.json。
 *
 * 用法：
 *   pnpm eval:companion
 *   pnpm eval:companion -- --db=E:\path\wbfm.sqlite --out=.tmp/companion.json
 *   pnpm eval:companion -- --weights=hour=0.2,mood=0.15,level=0.15,work=0.2,idleCost=0.15,fresh=0.15
 *
 * 退出码：数据库/参数等基础设施错误 = 2；其余 = 0（报告工具不作为门禁）。
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DECISION_WEIGHTS,
  DEFAULT_EVAL_CONTEXTS,
  attachGate,
  diffMatrix,
  replayDecisions,
  runMatrix,
  summarizeDecisions,
  toCandidateFromSnapshot,
  toDecisionCandidate,
} from '../../packages/shared/dist/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FIXTURE_PATH = join(HERE, 'companion-fixtures.json');
const DEFAULT_OUT = join(ROOT, 'docs/eval/companion-report.json');
const DEFAULT_LIMIT = 50;
const KEYS = [
  'pet-script.decisions',
  'pet-script.generation',
  'pet-script.journal',
  'pet-script.playback',
  'pet-script.schedule',
];

function parseArgs(argv) {
  const args = { db: null, out: DEFAULT_OUT, weights: null, limit: DEFAULT_LIMIT };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--db=')) args.db = resolve(arg.slice('--db='.length));
    else if (arg.startsWith('--out=')) args.out = resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--weights=')) args.weights = arg.slice('--weights='.length);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('node scripts/eval/companion-report.mjs [--db=path] [--out=path] [--weights=k=v,...] [--limit=50]');
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) throw new Error('--limit 需要正整数');
  args.limit = Math.min(DEFAULT_LIMIT, Math.floor(args.limit));
  return args;
}

function defaultDbPath() {
  const root = process.env.WBFM_DATA_ROOT?.trim() || join(homedir(), '.workbuddy-for-me');
  return join(root, 'db', 'wbfm.sqlite');
}

function parseWeights(raw) {
  if (!raw) return { ...DECISION_WEIGHTS };
  const weights = { ...DECISION_WEIGHTS };
  for (const pair of raw.split(',')) {
    const [key, value] = pair.split('=').map((item) => item.trim());
    if (!(key in weights)) throw new Error(`未知权重: ${key}`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new Error(`权重需要 0–1: ${pair}`);
    }
    weights[key] = parsed;
  }
  return weights;
}

function openSettings(dbPath) {
  const requireFromDatabase = createRequire(join(ROOT, 'packages/database/package.json'));
  const Database = requireFromDatabase('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const placeholders = KEYS.map(() => '?').join(',');
  const rows = db.prepare(`SELECT key, value FROM settings_kv WHERE key IN (${placeholders})`).all(...KEYS);
  db.close();
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = null;
    }
  }
  return settings;
}

function localDateKey(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function resolvePlayback(raw) {
  const today = localDateKey();
  const value = raw && typeof raw === 'object' ? raw : {};
  if (value.date !== today) {
    return { perDay: Number(value.perDay) || 3, playsToday: 0, playedSceneIds: [] };
  }
  return {
    perDay: Number(value.perDay) || 3,
    playsToday: Number(value.playsToday) || 0,
    playedSceneIds: Array.isArray(value.playedSceneIds)
      ? value.playedSceneIds.filter((id) => typeof id === 'string')
      : [],
  };
}

function buildCandidates(generation, journal, playback) {
  const scenes = Array.isArray(generation?.scenes) ? generation.scenes : [];
  const journalItems = Array.isArray(journal?.items) ? journal.items : [];
  const journalById = new Map(journalItems.map((item) => [item.sceneId, item]));
  const played = new Set(playback.playedSceneIds);
  return scenes
    .filter((scene) => scene && typeof scene.id === 'string')
    .map((scene) => {
      const entry = journalById.get(scene.id);
      const candidate = toDecisionCandidate(
        scene,
        entry?.theme ? { theme: entry.theme, tags: [] } : undefined,
      );
      return {
        ...candidate,
        playedToday: played.has(scene.id),
        lastPlayedAt: typeof entry?.playedAt === 'number' ? entry.playedAt : null,
      };
    });
}

function readPrevious(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db ?? defaultDbPath();
  const weights = parseWeights(args.weights);
  const settings = openSettings(dbPath);

  const decisions = Array.isArray(settings['pet-script.decisions']?.items)
    ? settings['pet-script.decisions'].items.slice(0, args.limit)
    : [];
  const candidates = buildCandidates(
    settings['pet-script.generation'],
    settings['pet-script.journal'],
    resolvePlayback(settings['pet-script.playback']),
  );
  const candidatesById = Object.fromEntries(candidates.map((item) => [item.sceneId, item]));
  const replay = replayDecisions(decisions, candidatesById, weights);

  const fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  const contexts = Array.isArray(fixtures.contexts) ? fixtures.contexts : DEFAULT_EVAL_CONTEXTS;
  const matrixCandidates =
    candidates.length >= 3
      ? candidates.map((item) => ({ ...item }))
      : fixtures.candidates.map(toCandidateFromSnapshot);
  const matrixRows = runMatrix(contexts, matrixCandidates, weights);

  const playback = resolvePlayback(settings['pet-script.playback']);
  const unplayedScenes = candidates.filter((item) => !playback.playedSceneIds.includes(item.sceneId)).length;
  const metrics = attachGate(summarizeDecisions(decisions, args.limit), {
    perDay: playback.perDay,
    playsToday: playback.playsToday,
    budgetRemaining: Math.max(0, playback.perDay - playback.playsToday),
    unplayedScenes,
    // 脚本不读 app-settings；勿扰状态以设置页质量卡为准
    quietHoursActive: false,
  });

  const previous = readPrevious(args.out);
  const rankDiff =
    previous?.matrix?.rows && previous?.weights && JSON.stringify(previous.weights) !== JSON.stringify(weights)
      ? diffMatrix(previous.matrix.rows, matrixRows)
      : [];

  const report = {
    version: 'v4.1',
    at: new Date().toISOString(),
    dbFile: basename(dbPath),
    weights,
    limit: args.limit,
    decisions: replay,
    metrics,
    matrix: {
      contexts: contexts.length,
      candidates: matrixCandidates.length,
      source: candidates.length >= 3 ? 'generation' : 'fixtures',
      rows: matrixRows,
      rankDiff,
    },
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`决策回放：${replay.total} 条，可回放 ${replay.replayable}，缺失 ${replay.missing}`);
  console.log(
    `分数差：均值 ${replay.meanAbsDelta ?? '—'}，最大 ${replay.maxAbsDelta ?? '—'}（去重/偏好增量沿用记录）`,
  );
  console.log(
    `指标：重复率 ${metrics.repeatRate} · 去重命中 ${metrics.dedupeRate} · 弱偏好 ${metrics.prefRate} · 未播 ${metrics.freshRate} · 平均分 ${metrics.avgScore}`,
  );
  console.log(
    `门控：预算 ${metrics.gate.budgetRemaining}/${metrics.gate.perDay} · 今日已播 ${metrics.gate.playsToday} · 未播场景 ${metrics.gate.unplayedScenes}`,
  );
  console.log(`矩阵：${contexts.length} 组上下文 × ${matrixCandidates.length} 候选（${report.matrix.source}）`);
  for (const row of matrixRows.slice(0, 4)) {
    const top = row.ranked[0];
    console.log(`  ${row.contextId} ${row.label} → ${top?.sceneId ?? '—'} (${top?.score ?? '—'})`);
  }
  if (rankDiff.length > 0) {
    console.log(`权重变化导致 ${rankDiff.length} 处排名变化：`);
    for (const diff of rankDiff.slice(0, 8)) {
      console.log(`  ${diff.contextId} ${diff.sceneId}: ${diff.fromRank ?? '—'} → ${diff.toRank ?? '—'}`);
    }
  }
  console.log(`报告：${args.out}`);
}

try {
  main();
} catch (error) {
  console.error(`[companion-report] ${error.message}`);
  process.exitCode = 2;
}
