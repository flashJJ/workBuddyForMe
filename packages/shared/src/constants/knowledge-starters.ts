/**
 * v2.3 开箱即用：内置知识库模板。
 *
 * 固定 id 保证幂等播种（对齐内置工作流 / 技能「已存在则跳过、不覆盖用户改动」策略）；
 * core 的启动播种与 web 的「从模板创建」共用同一份定义，避免两处漂移。
 * 模板默认不带样本文档（避免污染用户数据与备份体积），只给名称 / 描述 / 推荐分块参数。
 */
export interface KnowledgeBaseStarter {
  id: string;
  name: string;
  description: string;
  /** 推荐分块大小（缺省用全局 DEFAULT_CHUNK_SIZE） */
  chunkSize?: number;
  /** 推荐分块重叠（缺省用全局 DEFAULT_CHUNK_OVERLAP） */
  chunkOverlap?: number;
}

const ID_PREFIX = 'c0000000-0000-4000-8000-00000000000';

export const STARTER_KNOWLEDGE_BASES: readonly KnowledgeBaseStarter[] = [
  {
    id: `${ID_PREFIX}1`,
    name: '产品需求',
    description: '沉淀产品需求文档、原型说明与验收口径，便于按需求提问与检索。建议整篇上传 PRD / 需求单。',
    chunkSize: 600,
    chunkOverlap: 80,
  },
  {
    id: `${ID_PREFIX}2`,
    name: '会议纪要',
    description: '收纳会议纪要与逐字稿，按「结论 / 行动项」检索。纪要类文档段落偏短，可用较小的分块。',
    chunkSize: 400,
    chunkOverlap: 60,
  },
  {
    id: `${ID_PREFIX}3`,
    name: '研究资料',
    description: '存放行业报告、竞品资料与技术调研，供资料研究类工作流检索引用。长文建议使用较大分块。',
    chunkSize: 800,
    chunkOverlap: 100,
  },
];
