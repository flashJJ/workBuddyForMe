import type { DatabaseInstance } from '../client';
import type { Assistant, ToolName } from '@wbfm/shared';
import { newId, nowIso, mapAssistant, type AssistantRow } from './mappers';

export interface AssistantCreateFields {
  /** 不传则自动生成 UUID；种子数据使用固定 id 保证幂等 */
  id?: string;
  name: string;
  emoji: string | null;
  color: string | null;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number | null;
  modelId: string | null;
  knowledgeBaseId: string | null;
  enabledTools: ToolName[];
  retrieveAlways: boolean;
  isBuiltin: boolean;
  sortOrder: number;
}

export type AssistantUpdateFields = Partial<Omit<AssistantCreateFields, 'isBuiltin' | 'id'>>;

const COLUMN_MAP: Record<keyof AssistantUpdateFields, string> = {
  name: 'name',
  emoji: 'emoji',
  color: 'color',
  systemPrompt: 'system_prompt',
  temperature: 'temperature',
  topP: 'top_p',
  maxTokens: 'max_tokens',
  modelId: 'model_id',
  knowledgeBaseId: 'knowledge_base_id',
  enabledTools: 'enabled_tools',
  retrieveAlways: 'retrieve_always',
  sortOrder: 'sort_order',
};

/** 写入前把领域字段转换为列值（JSON/布尔归一） */
function toRowValues(fields: Partial<AssistantCreateFields>): Record<string, unknown> {
  const values: Record<string, unknown> = { ...fields };
  if (fields.enabledTools !== undefined) values.enabledTools = JSON.stringify(fields.enabledTools);
  if (fields.retrieveAlways !== undefined) {
    values.retrieveAlways = fields.retrieveAlways ? 1 : 0;
  }
  return values;
}

export function createAssistantRepository(db: DatabaseInstance) {
  return {
    create(fields: AssistantCreateFields): Assistant {
      const id = fields.id ?? newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO assistants
           (id, name, emoji, color, system_prompt, temperature, top_p, max_tokens,
            model_id, knowledge_base_id, enabled_tools, retrieve_always,
            is_builtin, sort_order, created_at, updated_at)
         VALUES
           (@id, @name, @emoji, @color, @systemPrompt, @temperature, @topP, @maxTokens,
            @modelId, @knowledgeBaseId, @enabledTools, @retrieveAlways,
            @isBuiltin, @sortOrder, @ts, @ts)`,
      ).run({
        ...toRowValues(fields),
        id,
        isBuiltin: fields.isBuiltin ? 1 : 0,
        ts,
      });
      return this.findById(id)!;
    },

    findById(id: string): Assistant | null {
      const row = db.prepare(`SELECT * FROM assistants WHERE id = ?`).get(id) as
        | AssistantRow
        | undefined;
      return row ? mapAssistant(row) : null;
    },

    list(): Assistant[] {
      return (
        db
          .prepare(`SELECT * FROM assistants ORDER BY sort_order ASC, created_at ASC`)
          .all() as AssistantRow[]
      ).map(mapAssistant);
    },

    update(id: string, fields: AssistantUpdateFields): Assistant | null {
      const keys = Object.keys(fields) as (keyof AssistantUpdateFields)[];
      if (keys.length === 0) return this.findById(id);
      const assignments = keys.map((k) => `${COLUMN_MAP[k]} = @${k}`).join(', ');
      db.prepare(
        `UPDATE assistants SET ${assignments}, updated_at = @updated_at WHERE id = @id`,
      ).run({ ...toRowValues(fields), updated_at: nowIso(), id });
      return this.findById(id);
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM assistants WHERE id = ? AND is_builtin = 0`).run(id)
        .changes > 0;
    },

    count(): number {
      return (db.prepare(`SELECT COUNT(*) AS n FROM assistants`).get() as { n: number }).n;
    },
  };
}

export type AssistantRepository = ReturnType<typeof createAssistantRepository>;
