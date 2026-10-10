export {
  createDatabase,
  initDatabase,
  getDatabase,
  closeDatabase,
  __setDatabaseForTest,
  type DatabaseInstance,
} from './client';
export { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './migrations/runner';
export { migrateV001 } from './migrations/v001-initial-schema';
export {
  ensureVectorTable,
  getVectorDimension,
  insertChunkVectors,
  deleteVectorsByDocument,
  searchChunks,
  normalizeVector,
  VECTOR_DIM_META_KEY,
  type ChunkVectorRow,
  type ChunkSearchResult,
} from './vector';
export {
  ensureMemoryVectorTable,
  getMemoryVectorDimension,
  upsertMemoryVector,
  deleteMemoryVector,
  deleteAllMemoryVectors,
  searchMemoryVectors,
  MEMORY_VECTOR_DIM_META_KEY,
  type MemoryVectorRow,
  type MemorySearchResult,
} from './memory-vector';
export * from './repositories';
export { getMeta, setMeta } from './meta';
export { nowIso, timestamps } from './utils/time';
export {
  buildFtsQuery,
  isCjkChar,
  normalizeForFtsIndex,
  tokenizeForFts,
} from './fts-tokenize';
export { createFtsChunkRepository, type FtsChunkRow } from './fts-chunk-repo';
