/**
 * v4.19 M3：回放报告历史归档与上次对比（纯函数 + 轻量文件操作）。
 *
 * 历史文件与主报告遵循同一隐私约束：写入前复用 findSensitiveContent 扫描，
 * 命中绝对路径/令牌时拒绝落盘；保留最近 20 份，按文件名时间排序删除最旧。
 * 对比只做「本次候选 − 上次候选」的五项指标差值，不参与阈值判定。
 */
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPLAY_METRICS, findSensitiveContent } from './replay-contract.mjs';

export const REPLAY_HISTORY_DIR = 'history';
export const REPLAY_HISTORY_KEEP = 20;
export const REPLAY_COMPARE_LAST = 'last';

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function isHistoryName(name) {
  return name.startsWith('report-') && name.endsWith('.json');
}

/** ISO 去分隔符：2026-11-22T04:39:43.123Z → report-20261122T043943123Z.json */
export function replayHistoryFileName(at) {
  const source = typeof at === 'string' && at ? at : new Date().toISOString();
  const stamp = source.replace(/[^0-9TZ]/g, '');
  return `report-${stamp}.json`;
}

/** 按文件名时间序算出应删除的最旧文件；keep 至少保留 1 份 */
export function pruneHistoryNames(names, keep = REPLAY_HISTORY_KEEP) {
  const sorted = names.filter(isHistoryName).sort();
  const excess = sorted.length - Math.max(1, keep);
  return excess > 0 ? sorted.slice(0, excess) : [];
}

/**
 * 写入本次历史并清理超限旧文件。
 * @returns {Promise<{name:string, pruned:string[]}>}
 */
export async function recordReplayHistory({ dir, report, keep = REPLAY_HISTORY_KEEP }) {
  const sensitive = findSensitiveContent(report);
  if (sensitive.length > 0) {
    throw new Error(`回放历史隐私检查命中：${sensitive.join('、')}`);
  }
  const name = replayHistoryFileName(report?.at);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  const pruned = pruneHistoryNames(await readdir(dir), keep);
  for (const item of pruned) await unlink(join(dir, item));
  return { name, pruned };
}

/** 读取历史中最新一份（排除本次文件名）；目录/文件缺失时返回 null，不阻断回放 */
export async function readLatestReplayReport(dir, excludeName = '') {
  let names;
  try {
    names = (await readdir(dir)).filter(isHistoryName).sort();
  } catch {
    return null;
  }
  const latest = names.filter((name) => name !== excludeName).at(-1);
  if (!latest) return null;
  try {
    return JSON.parse(await readFile(join(dir, latest), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 五项指标对比：差值 = 本次候选 − 上次候选，保留三位。
 * @returns {{at:string|null, rows:Array<{metric:string, previous:number|null, current:number|null, delta:number|null}>}}
 */
export function compareReplayMetrics(previous, current) {
  const prev = previous?.metrics?.candidate ?? {};
  const cur = current?.metrics?.candidate ?? {};
  return {
    at: previous?.at ?? null,
    rows: REPLAY_METRICS.map((metric) => {
      const from = typeof prev[metric] === 'number' ? prev[metric] : null;
      const to = typeof cur[metric] === 'number' ? cur[metric] : null;
      return {
        metric,
        previous: from,
        current: to,
        delta: from === null || to === null ? null : round(to - from),
      };
    }),
  };
}
