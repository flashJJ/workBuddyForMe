/**
 * v2.0 浏览器安全的关系等级纯函数入口（与 event-client/stage-client 同模式）：
 * 只导出不依赖 better-sqlite3/原生模块的纯演算，供 web/desktop 直接判断
 * 展示等级与解锁闸门；服务端另走 core 根 barrel 的 emotion 域。
 */
export {
  levelScoreOf,
  levelFromScore,
  displayLevelOf,
  isRelationshipUnlocked,
  evaluateFloorAtCheckpoint,
  defaultRelationshipBlock,
  type RelationScores,
} from '../emotion/relationship-kernel';
