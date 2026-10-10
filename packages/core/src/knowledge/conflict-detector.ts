/**
 * 知识冲突检测（v1.3 M3/T3.3，纯函数、零模型、只建议不裁决）。
 *
 * 同一实体（normalized_name）在不同文档中的「取值型」描述不一致时产出冲突项，
 * 交知识库页「待裁决」区并列两处原句出处，由用户人工处理——绝不自动删改。
 *
 * 维度分组（不同维度天然豁免，解决「同名不同义」误报）：
 * - version：版本号（2.5 / v1.3.0 / 3.0.1），仅在实体名出现处的邻近窗口抽取；
 * - scalar：数字+单位（百分比/容量/金额…），同单位才比较，数值归一化；
 * - title：人物头衔（仅 kind=person，后缀白名单匹配）。
 *
 * 关键豁免：若同一文档同时陈述了两个值（如「X 从 2.5 升级到 3.0」），
 * 视为文档自身已解释差异，不报冲突；冲突必须跨文档各自陈述不同取值。
 */

export type ClaimDimension = 'version' | 'scalar' | 'title';

export interface ConflictMention {
  context: string;
  documentId: string;
  documentName: string;
  pageNo?: number | null;
  paragraphNo?: number | null;
}

export interface ConflictEntity {
  name: string;
  normalizedName: string;
  kind: string;
  aliases: string[];
  mentions: ConflictMention[];
}

export type ConflictOccurrence = ConflictMention;

export interface ConflictValue {
  /** 归一化值（版本去尾零、数值去 v 前缀；头衔为原文） */
  value: string;
  /** 首次出现的原始写法（展示用） */
  raw: string;
  /** 该值的出处（按文档去重后保留，上限 3 条防膨胀） */
  occurrences: ConflictOccurrence[];
}

export interface ConflictItem {
  entityName: string;
  normalizedName: string;
  dimension: ClaimDimension;
  /** ≥2 个不同取值，按首次出现顺序排列 */
  values: ConflictValue[];
}

/** 实体名前 6 / 后 16 字符为取值陈述窗口（限制邻接，避免同句远处无关数字） */
const WINDOW_BEFORE = 6;
const WINDOW_AFTER = 16;

const VERSION_RE = /(?:版本|version[ :：]?)?\s*v?(\d+\.\d+(?:\.\d+)*)/gi;
const SCALAR_RE = /(\d+(?:\.\d+)?)\s*(%|％|万|亿|GB|MB|TB|PB|ms|秒|分|元|米|个|条|页|版|次|倍)/g;
const TITLE_RE =
  /(?:担任|出任|任(?:职于)?|是)\s*([一-龥A-Za-z·]{2,12}?(?:经理|总裁|教授|主任|工程师|总监|会长|院长|校长|长官|合伙人))/g;

function surfaces(entity: ConflictEntity): string[] {
  return [...new Set([entity.name, ...entity.aliases].filter((s) => s.length >= 2))];
}

/** 归一化版本号：去 v 前缀、去尾部 .0 段（2.5.0 → 2.5） */
function normalizeVersion(raw: string): string {
  const parts = raw.toLowerCase().replace(/^v/, '').split('.');
  while (parts.length > 1 && parts[parts.length - 1] === '0') parts.pop();
  return parts.join('.');
}

/** 归一化标量：去多余前导零，统一全角百分号 */
function normalizeScalar(num: string, unit: string): string {
  return `${parseFloat(num)}${unit === '％' ? '%' : unit}`;
}

interface RawClaim {
  dimension: ClaimDimension;
  value: string;
  raw: string;
}

/** 在某条 mention 中，沿每个实体名出现位置开窗口抽取取值声明 */
function extractClaims(entity: ConflictEntity, context: string): RawClaim[] {
  const claims: RawClaim[] = [];
  const seen = new Set<string>();
  const push = (claim: RawClaim) => {
    const key = `${claim.dimension}:${claim.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      claims.push(claim);
    }
  };

  for (const surface of surfaces(entity)) {
    let from = 0;
    let hit = context.indexOf(surface, from);
    while (hit !== -1) {
      const end = hit + surface.length;
      const window = context.slice(Math.max(0, hit - WINDOW_BEFORE), end + WINDOW_AFTER);
      const offsetBias = Math.max(0, hit - WINDOW_BEFORE);

      for (const m of window.matchAll(VERSION_RE)) {
        // 跳过实体名自身匹配到的版本号位置（窗口起点偏移校正）
        const absStart = offsetBias + (m.index ?? 0);
        if (absStart >= hit && absStart < end) continue;
        push({ dimension: 'version', value: normalizeVersion(m[1]!), raw: m[1]! });
      }
      for (const m of window.matchAll(SCALAR_RE)) {
        push({ dimension: 'scalar', value: normalizeScalar(m[1]!, m[2]!), raw: m[0]!.trim() });
      }
      if (entity.kind === 'person') {
        for (const m of window.matchAll(TITLE_RE)) {
          push({ dimension: 'title', value: m[1]!, raw: m[1]! });
        }
      }

      from = end;
      hit = context.indexOf(surface, from);
    }
  }
  return claims;
}

/**
 * 检测知识库内全部实体的跨文档取值冲突。
 * 输出按实体名/维度确定性排序；无冲突返回空数组。
 */
export function detectConflicts(entities: ConflictEntity[]): ConflictItem[] {
  const items: ConflictItem[] = [];

  for (const entity of entities) {
    // dimension → value → 出处集合
    const byDimension = new Map<ClaimDimension, Map<string, ConflictValue>>();
    // 记录每个维度各自被哪些文档陈述过（用于「同文档双值」豁免）
    const docsByDimensionValue = new Map<string, Set<string>>();

    for (const mention of entity.mentions) {
      if (!surfaces(entity).some((s) => mention.context.includes(s))) continue;
      for (const claim of extractClaims(entity, mention.context)) {
        let byValue = byDimension.get(claim.dimension);
        if (!byValue) {
          byValue = new Map();
          byDimension.set(claim.dimension, byValue);
        }
        let group = byValue.get(claim.value);
        if (!group) {
          group = { value: claim.value, raw: claim.raw, occurrences: [] };
          byValue.set(claim.value, group);
        }
        const docKey = `${claim.dimension}:${claim.value}`;
        let docs = docsByDimensionValue.get(docKey);
        if (!docs) {
          docs = new Set();
          docsByDimensionValue.set(docKey, docs);
        }
        docs.add(mention.documentId);
        // 出处按「文档+原句」在该值组内去重，上限 3 条
        const dedupeKey = `${mention.documentId}:${mention.context}`;
        if (!group.occurrences.some((o) => `${o.documentId}:${o.context}` === dedupeKey)
          && group.occurrences.length < 3) {
          group.occurrences.push({ ...mention });
        }
      }
    }

    for (const [dimension, byValue] of byDimension) {
      const groups = [...byValue.values()];
      if (groups.length < 2) continue;
      // 豁免：任一文档同时陈述了其中任意两个值 → 文档自身已解释，不冲突
      const valueDocSets = groups.map((g) => docsByDimensionValue.get(`${dimension}:${g.value}`)!);
      let selfExplained = false;
      for (let i = 0; i < valueDocSets.length && !selfExplained; i += 1) {
        for (let j = i + 1; j < valueDocSets.length; j += 1) {
          if ([...valueDocSets[i]!].some((d) => valueDocSets[j]!.has(d))) {
            selfExplained = true;
            break;
          }
        }
      }
      if (selfExplained) continue;
      // 冲突须跨文档：不同值的出处文档集合不同（上面已保证无交集文档）
      items.push({
        entityName: entity.name,
        normalizedName: entity.normalizedName,
        dimension,
        values: groups,
      });
    }
  }

  return items.sort(
    (a, b) =>
      a.normalizedName.localeCompare(b.normalizedName, 'zh') ||
      a.dimension.localeCompare(b.dimension),
  );
}
