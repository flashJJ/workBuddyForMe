import type { DatabaseInstance } from '../client';
import type { ProviderProtocol } from '@wbfm/shared';
import { newId, nowIso, mapProvider, type ProviderRecord, type ProviderRow } from './mappers';

export interface ProviderCreateFields {
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKeyCipher: string | null;
  enabled: boolean;
  sortOrder: number;
}

export type ProviderUpdateFields = Partial<{
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKeyCipher: string;
  enabled: boolean;
  sortOrder: number;
}>;

const COLUMN_MAP: Record<keyof ProviderUpdateFields, string> = {
  name: 'name',
  protocol: 'protocol',
  baseUrl: 'base_url',
  apiKeyCipher: 'api_key_cipher',
  enabled: 'enabled',
  sortOrder: 'sort_order',
};

export function createProviderRepository(db: DatabaseInstance) {
  const rowToValue = (key: keyof ProviderUpdateFields, value: unknown) =>
    key === 'enabled' ? (value ? 1 : 0) : value;

  return {
    create(fields: ProviderCreateFields): ProviderRecord {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO providers
           (id, name, protocol, base_url, api_key_cipher, enabled, sort_order, created_at, updated_at)
         VALUES
           (@id, @name, @protocol, @baseUrl, @apiKeyCipher, @enabled, @sortOrder, @ts, @ts)`,
      ).run({
        id,
        name: fields.name,
        protocol: fields.protocol,
        baseUrl: fields.baseUrl,
        apiKeyCipher: fields.apiKeyCipher,
        enabled: fields.enabled ? 1 : 0,
        sortOrder: fields.sortOrder,
        ts,
      });
      return mapProvider(this.getRow(id)!);
    },

    list(): ProviderRecord[] {
      const rows = db
        .prepare(`SELECT * FROM providers ORDER BY sort_order ASC, name ASC`)
        .all() as ProviderRow[];
      return rows.map(mapProvider);
    },

    get(id: string): ProviderRecord | null {
      const row = this.getRow(id);
      return row ? mapProvider(row) : null;
    },

    /** 含密文的整行，仅供服务层在内存解密使用 */
    getRow(id: string): ProviderRow | null {
      return (
        (db.prepare(`SELECT * FROM providers WHERE id = ?`).get(id) as ProviderRow | undefined) ??
        null
      );
    },

    update(id: string, fields: ProviderUpdateFields): ProviderRecord | null {
      const keys = Object.keys(fields) as (keyof ProviderUpdateFields)[];
      if (keys.length === 0) return this.get(id);
      const assignments = keys.map((k) => `${COLUMN_MAP[k]} = @${k}`).join(', ');
      const params: Record<string, unknown> = { id, updated_at: nowIso() };
      for (const key of keys) params[key] = rowToValue(key, fields[key]);
      db.prepare(`UPDATE providers SET ${assignments}, updated_at = @updated_at WHERE id = @id`).run(
        params,
      );
      return this.get(id);
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM providers WHERE id = ?`).run(id).changes > 0;
    },

    count(): number {
      return (db.prepare(`SELECT COUNT(*) AS n FROM providers`).get() as { n: number }).n;
    },
  };
}

export type ProviderRepository = ReturnType<typeof createProviderRepository>;
