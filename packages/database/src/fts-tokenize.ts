/**
 * FTS5 中文/英文混合分词纯函数（v1.3 M0）。
 *
 * 背景：better-sqlite3 链接的 SQLite FTS5 默认 unicode61 分词器把连续汉字当成
 * 一个 token，无空格中文按词/字查不到；trigram 分词器又要求查询 ≥3 字符，
 * 2 字词（「混合」「知识」）不中（见 docs/plan/v1.3/01 实测）。
 *
 * 策略：写入与查询前统一归一化——拉丁字母/数字连续序列保留为整词（小写），
 * CJK 统一表意文字逐字拆成单字 token，以空格连接后交给 unicode61。
 * 这样 2 字中文词、中英混合、型号编号都能作为 token 序列被检索；
 * 连续性（短语）的精确性交由检索层的重排加权处理，召回层从宽。
 */

/** CJK 统一表意文字（扩展 A + 基本区 + 兼容表意） */
const CJK_PATTERN = /[㐀-䶿一-鿿豈-﫿]/;

/**
 * 归一化后的 token：
 * - 连续拉丁字母/数字为一个整词（小写），如 WorkBuddy→workbuddy、qwen2→qwen2
 * - 单个 CJK 字符为一个 token
 * 其余字符（标点/空白/符号）作为分隔符丢弃。
 */
const TOKEN_PATTERN = /[a-z0-9]+|[㐀-䶿一-鿿豈-﫿]/g;

/** 判断字符是否为 CJK 表意文字（导出供测试与调用方复用同一标准） */
export function isCjkChar(ch: string): boolean {
  return ch.length === 1 && CJK_PATTERN.test(ch);
}

/**
 * 文本 → FTS5 可索引/可查询的 token 序列。
 * 空串或纯标点返回空数组（调用方据此跳过 FTS 匹配）。
 */
export function tokenizeForFts(text: string): string[] {
  if (!text) return [];
  return text.toLowerCase().match(TOKEN_PATTERN) ?? [];
}

/** 文本 → 空格连接的归一化串（写入 chunks_fts.content 用） */
export function normalizeForFtsIndex(text: string): string {
  return tokenizeForFts(text).join(' ');
}

/** FTS5 双引号字符串内的双引号需写成两个双引号 */
function quoteTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

/**
 * 查询串 → FTS5 MATCH 表达式：token 间以 OR 连接（召回从宽，
 * 精确性由上层 RRF 融合 + 规则重排的短语/覆盖率加权保证）。
 * 无可检索 token（空串/纯标点）时返回 null，调用方应跳过 FTS 通道。
 */
export function buildFtsQuery(query: string): string | null {
  const tokens = tokenizeForFts(query);
  if (tokens.length === 0) return null;
  return tokens.map(quoteTerm).join(' OR ');
}
