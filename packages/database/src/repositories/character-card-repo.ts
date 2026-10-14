import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';
import type {
  CharacterCardRecord,
  CharacterCardSource,
  ParsedCharacterCard,
} from '@wbfm/shared/schemas';

interface CharacterCardRow {
  id: string;
  source: string;
  name: string;
  description: string;
  raw_markdown: string;
  parsed_json: string;
  default_emotion: string;
  voice: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: CharacterCardRow): CharacterCardRecord {
  let parsed: ParsedCharacterCard | null = null;
  try {
    parsed = JSON.parse(row.parsed_json) as ParsedCharacterCard;
  } catch {
    parsed = null;
  }
  // parsed_json 由服务端在写入前保证可解析；防御性兜底不应静默造假
  if (!parsed) throw new Error(`character_cards.parsed_json 损坏：${row.id}`);
  return {
    id: row.id,
    source: row.source as CharacterCardSource,
    name: row.name,
    description: row.description,
    rawMarkdown: row.raw_markdown,
    parsed,
    defaultEmotion: row.default_emotion as ParsedCharacterCard['defaultEmotion'],
    voice: row.voice,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CharacterCardCreateFields {
  id?: string;
  source: CharacterCardSource;
  rawMarkdown: string;
  parsed: ParsedCharacterCard;
  /** 播种/恢复时显式给时间戳；缺省 now */
  createdAt?: string;
  updatedAt?: string;
}

export interface CharacterCardRepository {
  create(fields: CharacterCardCreateFields): CharacterCardRecord;
  /** 仅更新原文与解析结果（内置卡由服务层拦截） */
  updateContent(id: string, rawMarkdown: string, parsed: ParsedCharacterCard): CharacterCardRecord | null;
  delete(id: string): boolean;
  findById(id: string): CharacterCardRecord | null;
  list(source?: CharacterCardSource): CharacterCardRecord[];
  /** 恢复用：INSERT OR IGNORE 幂等 upsert（固定 id 的内置卡冲突跳过） */
  upsertIgnore(record: CharacterCardRecord): void;
}

export function createCharacterCardRepository(db: DatabaseInstance): CharacterCardRepository {
  const insert = `INSERT INTO character_cards(
      id, source, name, description, raw_markdown, parsed_json,
      default_emotion, voice, created_at, updated_at)
    VALUES (
      @id, @source, @name, @description, @rawMarkdown, @parsedJson,
      @defaultEmotion, @voice, @createdAt, @updatedAt)`;

  const bind = (id: string, source: CharacterCardSource, raw: string, parsed: ParsedCharacterCard, ts: string) => ({
    id,
    source,
    name: parsed.name,
    description: parsed.description,
    rawMarkdown: raw,
    parsedJson: JSON.stringify(parsed),
    defaultEmotion: parsed.defaultEmotion,
    voice: parsed.voice,
    createdAt: ts,
    updatedAt: ts,
  });

  return {
    create(fields) {
      const id = fields.id ?? newId();
      const ts = fields.createdAt ?? nowIso();
      db.prepare(insert).run(bind(id, fields.source, fields.rawMarkdown, fields.parsed, ts));
      return this.findById(id)!;
    },

    updateContent(id, rawMarkdown, parsed) {
      const ts = nowIso();
      const result = db
        .prepare(
          `UPDATE character_cards SET
             name=@name, description=@description, raw_markdown=@rawMarkdown,
             parsed_json=@parsedJson, default_emotion=@defaultEmotion, voice=@voice,
             updated_at=@updatedAt
           WHERE id=@id AND source='custom'`,
        )
        .run(bind(id, 'custom', rawMarkdown, parsed, ts));
      if (result.changes === 0) return null;
      return this.findById(id);
    },

    delete(id) {
      return db.prepare(`DELETE FROM character_cards WHERE id = ? AND source = 'custom'`).run(id)
        .changes > 0;
    },

    findById(id) {
      const row = db.prepare(`SELECT * FROM character_cards WHERE id = ?`).get(id) as
        | CharacterCardRow
        | undefined;
      return row ? mapRow(row) : null;
    },

    list(source) {
      const rows = source
        ? (db
            .prepare(`SELECT * FROM character_cards WHERE source = ? ORDER BY source DESC, created_at ASC`)
            .all(source) as CharacterCardRow[])
        : (db
            .prepare(`SELECT * FROM character_cards ORDER BY source DESC, created_at ASC`)
            .all() as CharacterCardRow[]);
      return rows.map(mapRow);
    },

    upsertIgnore(record) {
      db.prepare(
        `INSERT OR IGNORE INTO character_cards(
           id, source, name, description, raw_markdown, parsed_json,
           default_emotion, voice, created_at, updated_at)
         VALUES (
           @id, @source, @name, @description, @rawMarkdown, @parsedJson,
           @defaultEmotion, @voice, @createdAt, @updatedAt)`,
      ).run({
        id: record.id,
        source: record.source,
        name: record.name,
        description: record.description,
        rawMarkdown: record.rawMarkdown,
        parsedJson: JSON.stringify(record.parsed),
        defaultEmotion: record.defaultEmotion,
        voice: record.voice,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    },
  };
}
