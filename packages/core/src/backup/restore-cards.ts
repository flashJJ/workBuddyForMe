/**
 * v1.8 角色卡恢复（备份 schema v4，随 events 轨；负载文件 characterCards.json）。
 * 全部 INSERT OR IGNORE 幂等：内置卡固定 id 冲突时跳过（以机内内置版本为准）。
 * 损坏负载给出与其他轨一致的校验错误；逐行 schema 校验，坏行跳过不阻断整轨。
 */
import { characterCardRecordSchema, type CharacterCardRecord } from '@wbfm/shared/character-card';
import { ApiError } from '@wbfm/shared/errors';
import { createCharacterCardRepository, type DatabaseInstance } from '@wbfm/database';

export interface CardsRestoreCounts {
  imported: number;
  skipped: number;
}

/** 解析 characterCards.json（损坏归档给出与其他轨一致的校验错误） */
export function readCardsTrackPayload(buf: Buffer): unknown[] {
  try {
    const parsed = JSON.parse(buf.toString('utf-8')) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'characterCards.json 解析失败，归档可能已损坏');
  }
}

/** 恢复角色卡（须在事务内调用；内置卡固定 id 冲突由 INSERT OR IGNORE 跳过） */
export function restoreCharacterCards(db: DatabaseInstance, rows: unknown[]): CardsRestoreCounts {
  const cards = createCharacterCardRepository(db);
  const counts: CardsRestoreCounts = { imported: 0, skipped: 0 };
  for (const raw of rows) {
    const parsed = characterCardRecordSchema.safeParse(raw);
    if (!parsed.success) {
      counts.skipped++;
      continue;
    }
    const record: CharacterCardRecord = parsed.data;
    // INSERT OR IGNORE 前查存在性：已存在（含机内内置卡同 id）一律计跳过，不覆盖本机版本
    if (cards.findById(record.id) !== null) {
      counts.skipped++;
      continue;
    }
    cards.upsertIgnore(record);
    counts.imported++;
  }
  return counts;
}

/**
 * 悬挂引用清理：助手 card_id 指向不存在卡的（旧档残缺/自定义卡未随档恢复），
 * 置 NULL 回落默认卡，不阻断恢复（与「删卡不级联删助手」语义一致）。
 * 返回被清理的助手数。
 */
export function nullifyDanglingCardRefs(db: DatabaseInstance): number {
  return db
    .prepare(
      `UPDATE assistants SET card_id = NULL
       WHERE card_id IS NOT NULL
         AND card_id NOT IN (SELECT id FROM character_cards)`,
    )
    .run().changes;
}
