/**
 * v2.19 M5：无模型关系抽取（纯函数）。
 *
 * 实体来自规则/LLM 编译产物；这里在同一句内找相邻实体对，用二者之间的
 * 动词/连接词作为关系标签（找不到则记为「共同提及」）。description 必须
 * 是原句逐字片段，编译器随后统一映射 chunk 坐标；无坐标关系不入库。
 */

import { splitSentences } from '../text-units';

/** 关系抽取只需实体名/归一化/别名（编译 seed 与规则实体都满足） */
export interface RelationEntity {
  name: string;
  normalizedName: string;
  aliases: string[];
}

export interface RelationSeed {
  fromName: string;
  fromNormalized: string;
  toName: string;
  toNormalized: string;
  relation: string;
  /** 原句（逐字） */
  context: string;
  confidence: number;
}

const ZH_RELATION =
  /^(?:是|属于|隶属于|归属于|收购|并购|投资|合作|供应|采购|签署|签订|引用|包含|位于|使用|依赖|开发|发布|兼容|支持|连接|服务|竞争|关联|相关|负责|管理|持有|控制|提供|需要|采用|基于)/;

const EN_RELATION =
  /^(?:acquired|acquires|owns|owned|uses|used|partners with|partnered with|supplies|supplied|signs|signed|includes|includes|supports|supported|belongs to|is|are|works with|depends on)/i;

const MAX_RELATIONS = 8;

function cleanRelation(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '');
  if (!text) return null;
  const zh = text.match(ZH_RELATION);
  if (zh) return zh[0]!.slice(0, 20);
  const en = text.match(EN_RELATION);
  if (en) return en[0]!.toLowerCase().slice(0, 20);
  return null;
}

function relationLabel(between: string): { relation: string; confidence: number } {
  const cleaned = cleanRelation(between);
  if (cleaned) return { relation: cleaned, confidence: 0.75 };
  return { relation: '共同提及', confidence: 0.55 };
}

function sameEntity(a: RelationEntity, b: RelationEntity): boolean {
  if (a.normalizedName === b.normalizedName) return true;
  const aSurfaces = new Set([a.name, ...a.aliases]);
  const bSurfaces = new Set([b.name, ...b.aliases]);
  for (const surface of aSurfaces) if (bSurfaces.has(surface)) return true;
  return false;
}

interface PresentEntity {
  entity: RelationEntity;
  index: number;
  surface: string;
}

/**
 * 抽取关系边：每个句子按出现顺序取相邻实体对（最多 3 对/句）；
 * 同一实体的别名对跳过；关系描述为原句，可回指来源。
 */
export function extractRuleRelations(
  text: string,
  entities: readonly RelationEntity[],
): RelationSeed[] {
  if (entities.length < 2) return [];
  const sentences = splitSentences(text);
  const output: RelationSeed[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const lower = sentence.text.toLowerCase();
    const present: PresentEntity[] = [];
    for (const entity of entities) {
      // 优先匹配实体本名；仅本名不出现时才用别名，避免把别名实体挤到同一位置
      const own = entity.name.length >= 2 ? lower.indexOf(entity.name.toLowerCase()) : -1;
      let best: { index: number; surface: string } | null = null;
      if (own >= 0) {
        best = { index: own, surface: entity.name };
      } else {
        for (const alias of entity.aliases) {
          if (alias.length < 2) continue;
          const index = lower.indexOf(alias.toLowerCase());
          if (index < 0) continue;
          if (!best || index < best.index) best = { index, surface: alias };
        }
      }
      if (best) present.push({ entity, ...best });
    }
    present.sort((a, b) => a.index - b.index || a.surface.length - b.surface.length);

    let pairs = 0;
    for (let i = 0; i < present.length - 1 && pairs < 3; i += 1) {
      const first = present[i]!;
      const second = present[i + 1]!;
      if (sameEntity(first.entity, second.entity)) continue;
      const between = sentence.text.slice(
        first.index + first.surface.length,
        second.index,
      );
      const after = sentence.text.slice(
        second.index + second.surface.length,
        second.index + second.surface.length + 24,
      );
      const connectorText = between
        .trim()
        .replace(/[「『"'“”‘’（(【[]+/, '')
        .replace(/[」』"'“”‘’）)】\]]+$/, '')
        .trim();
      const connectorOnly = /^(?:与|和|及|同|跟|、|and|with)$/i.test(connectorText);
      const { relation, confidence } = connectorOnly
        ? cleanRelation(after)
          ? { relation: cleanRelation(after)!, confidence: 0.75 }
          : relationLabel(between)
        : relationLabel(between);
      const key = `${first.entity.normalizedName}|${second.entity.normalizedName}|${relation}|${sentence.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({
        fromName: first.entity.name,
        fromNormalized: first.entity.normalizedName,
        toName: second.entity.name,
        toNormalized: second.entity.normalizedName,
        relation,
        context: sentence.text,
        confidence,
      });
      pairs += 1;
      if (output.length >= MAX_RELATIONS) return output;
    }
  }
  return output;
}
