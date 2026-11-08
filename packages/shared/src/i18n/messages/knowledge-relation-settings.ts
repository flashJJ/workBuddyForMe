/** v2.29 P2：关系检索多跳边界设置 */

export const zhKnowledgeRelationSettings = {
  title: '关系检索边界',
  description: '控制图检索的跳数与边数；默认 2 跳 / 12 条边，值越大召回越广，噪声与 token 也越多。',
  maxHops: '最大跳数（1–3）',
  maxEdges: '最大边数（4–24）',
  invalidHops: '跳数需为 1–3 的整数',
  invalidEdges: '边数需为 4–24 的整数',
};

export const enKnowledgeRelationSettings = {
  title: 'Relation retrieval limits',
  description:
    'Controls graph traversal hops and edges. Defaults are 2 hops / 12 edges; higher values broaden recall but add noise and tokens.',
  maxHops: 'Max hops (1–3)',
  maxEdges: 'Max edges (4–24)',
  invalidHops: 'Hops must be an integer between 1 and 3',
  invalidEdges: 'Edges must be an integer between 4 and 24',
};
