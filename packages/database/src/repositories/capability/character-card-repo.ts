import type { DatabaseInstance } from '../../client';
import { newId, nowIso } from '../ops/mappers';
import type {
  CharacterCardRecord,
  CharacterCardSource,
  ParsedCharacterCard,
} from '@wbfm/shared/schemas';
import type { StagePlan } from '@wbfm/shared/types';
import { stagePlanSchema } from '@wbfm/shared/schemas';

interface CharacterCardRow {
  id: string;
  source: string;
  name: string;
  description: string;
  raw_markdown: string;
  parsed_json: string;
  default_emotion: string;
  voice: string | null;
  /** v2.20：内置卡默认阶段（v044；老库结果集缺列时回落 null） */
  stage_plan_json?: string | null;
  created_at: string;
  updated_at: string;
}

function parseStagePlan(value: string | null | undefined): StagePlan | null {
  if (!value) return null;
  try {
    const parsed = stagePlanSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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
    stagePlan: parseStagePlan(row.stage_plan_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CharacterCardCreateFields {
  id?: string;
  source: CharacterCardSource;
  rawMarkdown: string;
  parsed: ParsedCharacterCard;
  /** v2.20：内置卡默认阶段；自定义卡缺省 null */
  stagePlan?: StagePlan | null;
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
  /** v2.20：内置卡补齐默认阶段（只在为空时写入，不覆盖用户已有阶段） */
  setBuiltinStagePlanIfEmpty(id: string, plan: StagePlan): void;
}

export function createCharacterCardRepository(db: DatabaseInstance): CharacterCardRepository {
  const insert = `INSERT INTO character_cards(
      id, source, name, description, raw_markdown, parsed_json,
      default_emotion, voice, stage_plan_json, created_at, updated_at)
    VALUES (
      @id, @source, @name, @description, @rawMarkdown, @parsedJson,
      @defaultEmotion, @voice, @stagePlan, @createdAt, @updatedAt)`;

  const bind = (
    id: string,
    source: CharacterCardSource,
    raw: string,
    parsed: ParsedCharacterCard,
    ts: string,
    stagePlan: StagePlan | null = null,
  ) => ({
    id,
    source,
    name: parsed.name,
    description: parsed.description,
    rawMarkdown: raw,
    parsedJson: JSON.stringify(parsed),
    defaultEmotion: parsed.defaultEmotion,
    voice: parsed.voice,
    stagePlan: stagePlan ? JSON.stringify(stagePlan) : null,
    createdAt: ts,
    updatedAt: ts,
  });

  return {
    create(fields) {
      const id = fields.id ?? newId();
      const ts = fields.createdAt ?? nowIso();
      db.prepare(insert).run(
        bind(id, fields.source, fields.rawMarkdown, fields.parsed, ts, fields.stagePlan ?? null),
      );
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
           default_emotion, voice, stage_plan_json, created_at, updated_at)
         VALUES (
           @id, @source, @name, @description, @rawMarkdown, @parsedJson,
           @defaultEmotion, @voice, @stagePlan, @createdAt, @updatedAt)`,
      ).run({
        id: record.id,
        source: record.source,
        name: record.name,
        description: record.description,
        rawMarkdown: record.rawMarkdown,
        parsedJson: JSON.stringify(record.parsed),
        defaultEmotion: record.defaultEmotion,
        voice: record.voice,
        stagePlan: record.stagePlan ? JSON.stringify(record.stagePlan) : null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    },

    setBuiltinStagePlanIfEmpty(id, plan) {
      db.prepare(
        `UPDATE character_cards SET stage_plan_json = ?, updated_at = ?
         WHERE id = ? AND source = 'builtin' AND stage_plan_json IS NULL`,
      ).run(JSON.stringify(plan), nowIso(), id);
    },
  };
}
