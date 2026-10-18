/**
 * 交互门控用的「关系等级」原语。
 *
 * v2.3 M1 从 interaction-resolvers 抽出：动画图条目的等级门槛条件与 Resolver 门控共用同一份口径。
 * 数值 0–3 ↔ 等级名顺序与 relationshipLevelSchema 一致（0 陌生 / 1 认识 / 2 搭档 / 3 挚友）。
 */

export type RelationshipLevel = 'stranger' | 'acquaintance' | 'partner' | 'intimate';

/** 展示关系等级（数值 0–3）→ 门控等级名的顺序口径 */
export const RELATIONSHIP_LEVEL_NAMES: readonly RelationshipLevel[] = [
  'stranger',
  'acquaintance',
  'partner',
  'intimate',
];

/** 数值等级 0–3 → 门控等级名（越界夹紧；非有限值回落「陌生」） */
export function relationshipLevelName(level: number): RelationshipLevel {
  if (!Number.isFinite(level)) return 'stranger';
  const index = Math.min(RELATIONSHIP_LEVEL_NAMES.length - 1, Math.max(0, Math.round(level)));
  return RELATIONSHIP_LEVEL_NAMES[index] ?? 'stranger';
}

/** 当前等级是否达到最低门槛 */
export function levelAtLeast(current: RelationshipLevel, min: RelationshipLevel): boolean {
  return RELATIONSHIP_LEVEL_NAMES.indexOf(current) >= RELATIONSHIP_LEVEL_NAMES.indexOf(min);
}
