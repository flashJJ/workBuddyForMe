/**
 * @v1.8 角色卡域：Markdown 文本 mod 的 schema、零依赖解析器与内置卡。
 */
export * from '../schemas/character-card';
export { parseCharacterCard } from './parser';
export {
  BUILTIN_CARD_SEEDS,
  BUILTIN_CARD_CAPABLE_COLLEAGUE,
  BUILTIN_CARD_CHEERFUL_BUDDY,
  BUILTIN_CARD_CALM_ADVISOR,
  BUILTIN_CARD_WARM_COMPANION,
  BUILTIN_CARD_RESEARCH_SCOUT,
  BUILTIN_CARD_STUDY_COACH,
  MIGRATED_CARD_NAME,
  type BuiltInCardSeed,
} from './built-in-cards';
