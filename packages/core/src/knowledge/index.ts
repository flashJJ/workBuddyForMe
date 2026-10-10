/** @域 barrel 知识编译（v1.3 M2：规则抽取/缝合定位/编译优先路由/编译器） */
export {
  splitSentences,
  isTitleLike,
  hasDefinitionSignal,
  type TextSpan,
} from './text-units';
export {
  extractRuleSummary,
  extractKeyTerms,
  type RuleSummary,
} from './rule-extractor';
export {
  extractRuleEntities,
  normalizeEntityName,
  MODEL_PATTERN,
  type EntitySpec,
  type EntityMentionSpec,
  type EntityKind,
} from './entity-extractor';
export {
  stitchChunks,
  overlapLength,
  type StitchChunk,
  type StitchedDocument,
  type CharRun,
} from './stitch-chunks';
export {
  locateMention,
  locateMentions,
  locateContexts,
  type MentionLocation,
  type MentionSpan,
  type LocatedMention,
  type LocatedContext,
} from './locate-mentions';
export {
  analyzeQuery,
  isEntityMentioned,
  isSummaryRelevant,
  selectStaticKnowledge,
  type QuerySignals,
  type StaticFact,
  type StaticFactKind,
  type StaticSelectorOptions,
  type SelectorEntity,
  type SelectorMention,
  type SelectorSummary,
} from './static-selector';
export { createStaticKnowledgeService, type StaticKnowledgeService } from './static-knowledge-service';
export { createLlmKnowledgeEnhancer, validateLlmSeed, type LlmEnhancerOptions } from './llm-enhancer';
export {
  compileDocument,
  type CompiledSeed,
  type KnowledgeEntitySeed,
  type KnowledgeEnhancer,
  type CompileDocumentOptions,
  type CompileDocumentResult,
} from './knowledge-compiler';
