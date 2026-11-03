/** @子域 barrel 知识关系：规则关系抽取与多跳扩展 */
export {
  extractRuleRelations,
  type RelationEntity,
  type RelationSeed,
} from './relation-extractor';
export {
  collectMultiHopRelations,
  type MultiHopOptions,
  type MultiHopRelation,
} from './relation-retrieval';
