import { describe, expect, it } from 'vitest';
import { extractRuleRelations, type RelationEntity } from './relation-extractor';

function entity(name: string, aliases: string[] = []): RelationEntity {
  return { name, normalizedName: name.toLowerCase().replace(/\s+/g, ''), aliases };
}

describe('extractRuleRelations（v2.19 M5）', () => {
  it('同句实体对：取二者之间的动词作为关系，保留原句与置信度', () => {
    const relations = extractRuleRelations('“Acme” 收购 “Beta”。', [entity('Acme'), entity('Beta')]);
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      fromName: 'Acme',
      toName: 'Beta',
      relation: '收购',
      context: '“Acme” 收购 “Beta”。',
      confidence: 0.75,
    });
  });

  it('无明确动词时回落「共同提及」，置信度较低', () => {
    const relations = extractRuleRelations('“Acme” 与 “Beta” 都是供应商。', [
      entity('Acme'),
      entity('Beta'),
    ]);
    expect(relations[0]).toMatchObject({ relation: '共同提及', confidence: 0.55 });
  });

  it('英文动词关系', () => {
    const relations = extractRuleRelations('"Acme" acquired "Beta" in 2024.', [
      entity('Acme'),
      entity('Beta'),
    ]);
    expect(relations[0]).toMatchObject({ relation: 'acquired', confidence: 0.75 });
  });

  it('同一实体的别名对不产生自关系', () => {
    const text = 'Acme（艾克米）收购 Beta（贝塔）。';
    const entities = [
      entity('Acme', ['艾克米']),
      entity('艾克米', ['Acme']),
      entity('Beta'),
      entity('贝塔'),
    ];
    const relations = extractRuleRelations(text, entities);
    const self = relations.find(
      (relation) => relation.fromName === 'Acme' && relation.toName === '艾克米',
    );
    expect(self).toBeUndefined();
    expect(relations.some((relation) => relation.relation === '收购')).toBe(true);
  });

  it('多句分别抽取；不足两个实体时为空', () => {
    const text = '“Acme” 收购 “Beta”。\n“Beta” 与 “Gamma” 合作。';
    const relations = extractRuleRelations(text, [
      entity('Acme'),
      entity('Beta'),
      entity('Gamma'),
    ]);
    expect(relations.map((relation) => relation.relation)).toEqual(['收购', '合作']);
    expect(extractRuleRelations(text, [entity('Acme')])).toEqual([]);
  });
});
