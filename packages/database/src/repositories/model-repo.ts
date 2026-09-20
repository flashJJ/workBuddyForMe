import type { DatabaseInstance } from '../client';
import type { ModelCapability } from '@wbfm/shared';
import { newId, nowIso, mapModel, type ModelRow } from './mappers';
import type { ProviderModel } from '@wbfm/shared';

export interface ModelCreateFields {
  providerId: string;
  modelId: string;
  displayName?: string;
  capabilities: ModelCapability[];
  contextWindow: number | null;
}

export function createModelRepository(db: DatabaseInstance) {
  return {
    create(fields: ModelCreateFields): ProviderModel {
      const id = newId();
      db.prepare(
        `INSERT INTO models
           (id, provider_id, model_id, display_name, capabilities, context_window, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        fields.providerId,
        fields.modelId,
        fields.displayName ?? fields.modelId,
        JSON.stringify(fields.capabilities),
        fields.contextWindow,
        nowIso(),
      );
      return this.findById(id)!;
    },

    findById(id: string): ProviderModel | null {
      const row = db.prepare(`SELECT * FROM models WHERE id = ?`).get(id) as ModelRow | undefined;
      return row ? mapModel(row) : null;
    },

    listByProvider(providerId: string): ProviderModel[] {
      return (
        db
          .prepare(`SELECT * FROM models WHERE provider_id = ? ORDER BY model_id ASC`)
          .all(providerId) as ModelRow[]
      ).map(mapModel);
    },

    listByCapability(capability: ModelCapability): ProviderModel[] {
      const rows = db.prepare(`SELECT * FROM models ORDER BY created_at DESC`).all() as ModelRow[];
      return rows.map(mapModel).filter((m) => m.capabilities.includes(capability));
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM models WHERE id = ?`).run(id).changes > 0;
    },

    exists(providerId: string, modelId: string): boolean {
      return (
        (
          db
            .prepare(`SELECT 1 FROM models WHERE provider_id = ? AND model_id = ?`)
            .get(providerId, modelId) as { 1: number } | undefined
        ) !== undefined
      );
    },
  };
}

export type ModelRepository = ReturnType<typeof createModelRepository>;
