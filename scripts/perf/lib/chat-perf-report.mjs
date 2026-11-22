/**
 * v4.20 M1：对话性能报告聚合与归档（纯函数 + 轻量文件操作）。
 *
 * 输入是各场景的分段指标样本；输出固定结构报告，写 test-results/perf/，
 * 保留最近 20 份并维护 latest.json。报告不含正文、令牌与绝对路径。
 */
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findSensitiveContent } from '../../eval/lib/replay-contract.mjs';

export const CHAT_PERF_METRICS = [
  'coldStartMs',
  'firstTokenMs',
  'firstParagraphMs',
  'completionMs',
];

export const CHAT_PERF_DIR = 'test-results/perf';
export const CHAT_PERF_KEEP = 20;
export const FIRST_TOKEN_ABSOLUTE_LIMIT_MS = 10_000;

function round(value) {
  return Math.round(value);
}

/** 线性插值百分位；无有效值返回 null */
export function percentile(values, p) {
  const sorted = (values ?? [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return round(sorted[low] + (sorted[high] - sorted[low]) * (rank - low));
}

/** 首字阈值：相对基线 + 绝对兜底 */
export function firstTokenThreshold(p50) {
  if (typeof p50 !== 'number' || !Number.isFinite(p50)) return FIRST_TOKEN_ABSOLUTE_LIMIT_MS;
  return Math.min(round(p50 * 1.5), FIRST_TOKEN_ABSOLUTE_LIMIT_MS);
}

/** 汇总单个场景的样本为 p50/p95 */
export function summarizeSamples(samples) {
  const metrics = {};
  for (const metric of CHAT_PERF_METRICS) {
    const values = (samples ?? []).map((sample) => sample?.[metric]);
    metrics[metric] = { p50: percentile(values, 50), p95: percentile(values, 95) };
  }
  return metrics;
}

/**
 * 组装报告；预算里的首字阈值取所有场景 firstToken 样本的 P50。
 * @param {{at?:string, env?:object, scenarios:Array<{name:string, samples:Array<Record<string,number>>}>}} input
 */
export function createChatPerfReport({ at = new Date().toISOString(), env = {}, scenarios = [] }) {
  const normalized = scenarios.map((scenario) => ({
    name: scenario.name,
    samples: scenario.samples?.length ?? 0,
    metrics: summarizeSamples(scenario.samples),
  }));
  const firstTokens = scenarios.flatMap((scenario) =>
    (scenario.samples ?? []).map((sample) => sample?.firstTokenMs),
  );
  const p50 = percentile(firstTokens, 50);
  return {
    suite: 'chat-perf',
    version: 1,
    at,
    env: {
      platform: String(env.platform ?? 'unknown'),
      arch: String(env.arch ?? 'unknown'),
      cpuCount: Number(env.cpuCount) || 0,
      node: String(env.node ?? ''),
    },
    scenarios: normalized,
    budget: {
      firstToken: {
        p50,
        threshold: firstTokenThreshold(p50),
        absoluteLimit: FIRST_TOKEN_ABSOLUTE_LIMIT_MS,
      },
      scrollP95FrameMs: 20,
    },
  };
}

/** report-<ISO去分隔符>.json */
export function reportFileName(at) {
  const source = typeof at === 'string' && at ? at : new Date().toISOString();
  return `report-${source.replace(/[^0-9TZ]/g, '')}.json`;
}

function isReportName(name) {
  return name.startsWith('report-') && name.endsWith('.json');
}

/** 按文件名时间序算出应删除的最旧报告；latest.json 不参与 */
export function pruneReportNames(names, keep = CHAT_PERF_KEEP) {
  const sorted = names.filter(isReportName).sort();
  const excess = sorted.length - Math.max(1, keep);
  return excess > 0 ? sorted.slice(0, excess) : [];
}

/** 隐私检查 + 写入历史 + latest.json + 清理 */
export async function recordChatPerfReport({ dir, report, keep = CHAT_PERF_KEEP }) {
  const sensitive = findSensitiveContent(report);
  if (sensitive.length > 0) {
    throw new Error(`性能报告隐私检查命中：${sensitive.join('、')}`);
  }
  const name = reportFileName(report?.at);
  const body = `${JSON.stringify(report, null, 2)}\n`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), body, 'utf-8');
  await writeFile(join(dir, 'latest.json'), body, 'utf-8');
  const pruned = pruneReportNames(await readdir(dir), keep);
  for (const item of pruned) await unlink(join(dir, item));
  return { name, pruned };
}
