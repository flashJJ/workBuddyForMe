import {
  BUILTIN_CARD_SEEDS,
  parseCharacterCard,
} from '@wbfm/shared/character-card';
import {
  createAssistantRepository,
  createCharacterCardRepository,
  getMeta,
  nowIso,
  setMeta,
  type DatabaseInstance,
} from '@wbfm/database';
import { createIdentityCard } from './persona-card';

export const BUILTIN_ASSISTANT = {
  id: 'builtin-general',
  name: '通用助手',
  emoji: '🤖',
  color: '#4f8cff',
  systemPrompt: '你是一个乐于助人的中文私人 AI 助手，请简洁、准确地回答问题。',
} as const;

/** 旧 systemPrompt 迁移守卫（meta 键；备份恢复 v3 旧档后需 force 重跑） */
export const LEGACY_CARD_MIGRATION_KEY = 'characterCardsMigrationDone';

/**
 * 内置角色卡播种：固定 id，INSERT OR IGNORE 幂等（机内已存在同 id 卡时跳过，以本机为准）。
 * 播种原文是发布契约的一部分，必须零错误零告警解析，否则 fail-fast。
 */
export function ensureBuiltinCharacterCards(db: DatabaseInstance): void {
  const cards = createCharacterCardRepository(db);
  const ts = nowIso();
  for (const seed of BUILTIN_CARD_SEEDS) {
    const result = parseCharacterCard(seed.rawMarkdown);
    const problems = result.ok
      ? result.warnings.map((w) => w.message)
      : result.errors.map((e) => `第${e.line ?? '?'}行 ${e.message}`);
    if (!result.ok || result.warnings.length > 0) {
      throw new Error(`内置角色卡 ${seed.id} 解析契约不达标：${problems.join('；')}`);
    }
    cards.upsertIgnore({
      id: seed.id,
      source: 'builtin',
      name: result.card.name,
      description: result.card.description,
      rawMarkdown: seed.rawMarkdown,
      parsed: result.card,
      defaultEmotion: result.card.defaultEmotion,
      voice: result.card.voice,
      createdAt: ts,
      updatedAt: ts,
    });
  }
}

/**
 * 旧助手 systemPrompt 一次性迁移（应用启动期，非 SQL 迁移）：
 * card_id 为空且提示词非空 → 原文逐字包成自建卡并回写 cardId；空提示词保持默认卡。
 * 守卫命中直接跳过；force 供备份恢复后重跑（已选卡助手天然跳过，不重复生成）。
 */
export function migrateLegacySystemPrompts(
  db: DatabaseInstance,
  options: { force?: boolean } = {},
): void {
  if (!options.force && getMeta(db, LEGACY_CARD_MIGRATION_KEY) === '1') return;

  const assistants = createAssistantRepository(db);
  db.transaction(() => {
    for (const assistant of assistants.list()) {
      if (assistant.cardId !== null || !assistant.systemPrompt.trim()) continue;
      const card = createIdentityCard(db, assistant.systemPrompt);
      assistants.update(assistant.id, { cardId: card.id });
    }
    setMeta(db, LEGACY_CARD_MIGRATION_KEY, '1');
  })();
}

/** 幂等种子：首次启动创建内置通用助手（固定 id，不可删除）+ v1.8 内置角色卡与旧提示词迁移 */
export function ensureSeedData(db: DatabaseInstance): void {
  const assistants = createAssistantRepository(db);
  if (!assistants.findById(BUILTIN_ASSISTANT.id)) {
    assistants.create({
      id: BUILTIN_ASSISTANT.id,
      name: BUILTIN_ASSISTANT.name,
      emoji: BUILTIN_ASSISTANT.emoji,
      color: BUILTIN_ASSISTANT.color,
      systemPrompt: BUILTIN_ASSISTANT.systemPrompt,
      temperature: 1,
      topP: 1,
      maxTokens: null,
      modelId: null,
      knowledgeBaseIds: [],
      enabledTools: [],
      retrieveAlways: false,
      isBuiltin: true,
      sortOrder: 0,
    });
  }
  ensureBuiltinCharacterCards(db);
  migrateLegacySystemPrompts(db);
}
