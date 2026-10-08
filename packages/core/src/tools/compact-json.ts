import { estimateTokens } from '../chat/context-budget';

/**
 * 通用 JSON 结构压缩（v1.1 M1，docs/plan/v1.1/02 §2.2 第 2/3 层）：
 * - 长字符串裁剪；深层嵌套数组取头部；
 * - 顶层数组按 token 预算贪心保留头部（形状信息+id 不丢），尾部插省略标记；
 * - 预算再紧走「只保身份字段」降级（保 id 不保内容）。
 * 纯函数：只接/返 JSON 可序列化数据，不读全局状态。
 */

/** 叶子字符串裁剪上限（字符；超出加省略号） */
const MAX_LEAF_CHARS = 120;
/** 深层嵌套数组（非顶层）的头部保留条数 */
const NESTED_ARRAY_HEAD = 5;
/** 数组省略标记的键名（插入为对象元素，保持 JSON 可 parse） */
export const OMITTED_MARKER_KEY = '__omitted';
/** 身份字段：id/编号/状态类——压缩到末级也必须保留（下一轮工具引用的句柄） */
const IDENTITY_KEY_RE =
  /(id|uid|uuid|code|no|num|index|status|state)$|编号|序号|索引|状态/i;

export interface JsonSamplingStats {
  /** 数组省略的元素总数（跨所有层级） */
  omittedItems: number;
  /** 被裁剪的长字符串数 */
  clippedStrings: number;
  /** 发生省略的数组层数 */
  sampledArrays: number;
}

export interface JsonCompactResult {
  text: string;
  stats: JsonSamplingStats;
  /** 是否发生任何结构性删减/裁剪（用于 compacted 判定） */
  changed: boolean;
  /** 是否用到了「只保身份字段」末级降级 */
  identityOnly: boolean;
}

function clipLeaf(value: string, stats: JsonSamplingStats): string {
  if (value.length <= MAX_LEAF_CHARS) return value;
  stats.clippedStrings += 1;
  return `${value.slice(0, MAX_LEAF_CHARS - 1)}…`;
}

function omittedMarker(count: number): Record<string, unknown> {
  return {
    [OMITTED_MARKER_KEY]: count,
    hint: `其余 ${count} 项已省略，可凭条内 id 再查询`,
  };
}

/** 深裁剪：字符串截短；深层数组头部取样；丢弃 null/undefined 叶子 */
function prune(value: unknown, depth: number, stats: JsonSamplingStats): unknown {
  if (typeof value === 'string') return clipLeaf(value, stats);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    const limited = depth > 0 && value.length > NESTED_ARRAY_HEAD;
    const source = limited ? value.slice(0, NESTED_ARRAY_HEAD) : value;
    const items = source.map((item) => prune(item, depth + 1, stats));
    if (limited) {
      stats.sampledArrays += 1;
      stats.omittedItems += value.length - NESTED_ARRAY_HEAD;
      items.push(omittedMarker(value.length - NESTED_ARRAY_HEAD));
    }
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === null || val === undefined) continue;
    out[key] = prune(val, depth + 1, stats);
  }
  return out;
}

/** 顶层数组按 token 预算贪心保留头部（至少 1 条），尾部加省略标记 */
function sampleTopArray(arr: unknown[], maxTokens: number, stats: JsonSamplingStats): unknown[] {
  const head: unknown[] = [];
  let used = estimateTokens('[ ]');
  for (const item of arr) {
    const candidate = prune(item, 1, stats);
    const cost = estimateTokens(JSON.stringify(candidate)) + 1;
    if (head.length > 0 && used + cost > maxTokens) break;
    head.push(candidate);
    used += cost;
  }
  const omitted = arr.length - head.length;
  if (omitted > 0) {
    stats.sampledArrays += 1;
    stats.omittedItems += omitted;
    const marker = omittedMarker(omitted);
    head.push(marker);
    used += estimateTokens(JSON.stringify(marker)) + 1;
  }
  return head;
}

function isIdentityKey(key: string): boolean {
  return IDENTITY_KEY_RE.test(key);
}

/** 只保身份字段：对象浅层提取 id/编号/状态类叶子；数组逐元素提取后同样可被预算取样 */
function pickIdentity(value: unknown, stats: JsonSamplingStats): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => pickIdentity(item, stats));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === null || val === undefined) continue;
      if (isIdentityKey(key) && (typeof val === 'string' || typeof val === 'number')) {
        out[key] = typeof val === 'string' ? clipLeaf(val, stats) : val;
      } else if (Array.isArray(val) && val.every((v) => v && typeof v === 'object')) {
        // 身份表里可能还嵌列表（如 items: [{id,...}]），递归保一层 id
        out[key] = (val as unknown[]).slice(0, NESTED_ARRAY_HEAD).map((v) => pickIdentity(v, stats));
      }
    }
    return out;
  }
  return typeof value === 'string' ? clipLeaf(value, stats) : value;
}

function emptyStats(): JsonSamplingStats {
  return { omittedItems: 0, clippedStrings: 0, sampledArrays: 0 };
}

/**
 * 压缩已 parse 的 JSON 数据到 maxTokens 以内。
 * 失败（无法压到预算内）返回 null，调用方降级为纯文本截断。
 */
export function compactJsonStructure(parsed: unknown, maxTokens: number): JsonCompactResult | null {
  // 第一轮：结构保留（长字符串裁剪 + 头部取样）
  const stats = emptyStats();
  let data: unknown = Array.isArray(parsed)
    ? sampleTopArray(parsed, maxTokens, stats)
    : prune(parsed, 0, stats);
  let text = JSON.stringify(data);
  let identityOnly = false;

  if (estimateTokens(text) > maxTokens && parsed && typeof parsed === 'object') {
    // 末级降级：只保身份字段，再按预算取样
    const idStats = emptyStats();
    const picked = pickIdentity(parsed, idStats);
    const idData = Array.isArray(picked) ? sampleTopArray(picked, maxTokens, idStats) : picked;
    const idText = JSON.stringify(idData);
    if (estimateTokens(idText) <= maxTokens) {
      data = idData;
      text = idText;
      Object.assign(stats, idStats, {
        omittedItems: stats.omittedItems + idStats.omittedItems,
        sampledArrays: stats.sampledArrays + idStats.sampledArrays,
      });
      identityOnly = true;
    }
  }

  if (estimateTokens(text) > maxTokens) return null;
  const changed =
    stats.omittedItems > 0 ||
    stats.clippedStrings > 0 ||
    stats.sampledArrays > 0 ||
    identityOnly;
  return { text, stats, changed, identityOnly };
}
