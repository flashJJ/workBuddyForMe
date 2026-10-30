import type {
  CapabilityKind,
  CapabilityManifest,
  CapabilityPermission,
  CapabilityStatus,
  CapabilityView,
} from '@wbfm/shared/schemas';
import type { DatabaseInstance } from '../client';
import { nowIso } from './mappers';

export interface CapabilityRow {
  id: string;
  kind: string;
  version: string;
  name: string;
  description: string;
  permissions_json: string;
  manifest_json: string;
  status: string;
  effect_ref: string | null;
  last_error: string | null;
  installed_at: string;
  updated_at: string;
}

export interface CapabilityCreateFields {
  manifest: CapabilityManifest;
  status: CapabilityStatus;
  effectRef?: string | null;
}

export interface CapabilityUpdateFields {
  status?: CapabilityStatus;
  effectRef?: string | null;
  lastError?: string | null;
}

function parsePermissions(raw: string): CapabilityPermission[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CapabilityPermission[]) : [];
  } catch {
    return [];
  }
}

export function mapCapability(row: CapabilityRow): CapabilityView {
  return {
    id: row.id,
    version: row.version,
    kind: row.kind as CapabilityKind,
    name: row.name,
    description: row.description,
    permissions: parsePermissions(row.permissions_json),
    status: row.status as CapabilityStatus,
    effectRef: row.effect_ref,
    lastError: row.last_error,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
  };
}

export function createCapabilityRepository(db: DatabaseInstance) {
  return {
    list(): CapabilityView[] {
      const rows = db
        .prepare(`SELECT * FROM capability_packs ORDER BY installed_at ASC, id ASC`)
        .all() as CapabilityRow[];
      return rows.map(mapCapability);
    },

    get(id: string): CapabilityView | null {
      const row = db.prepare(`SELECT * FROM capability_packs WHERE id = ?`).get(id) as
        | CapabilityRow
        | undefined;
      return row ? mapCapability(row) : null;
    },

    getManifest(id: string): CapabilityManifest | null {
      const row = db.prepare(`SELECT manifest_json FROM capability_packs WHERE id = ?`).get(id) as
        | { manifest_json: string }
        | undefined;
      if (!row) return null;
      try {
        return JSON.parse(row.manifest_json) as CapabilityManifest;
      } catch {
        return null;
      }
    },

    listEnabled(): Array<CapabilityView & { manifest: CapabilityManifest | null }> {
      return this.list()
        .filter((item) => item.status === 'enabled')
        .map((item) => ({ ...item, manifest: this.getManifest(item.id) }));
    },

    create(fields: CapabilityCreateFields): CapabilityView {
      const ts = nowIso();
      db.prepare(
        `INSERT INTO capability_packs(
           id, kind, version, name, description, permissions_json, manifest_json,
           status, effect_ref, last_error, installed_at, updated_at)
         VALUES (@id, @kind, @version, @name, @description, @permissions, @manifest,
           @status, @effectRef, NULL, @ts, @ts)`,
      ).run({
        id: fields.manifest.id,
        kind: fields.manifest.kind,
        version: fields.manifest.version,
        name: fields.manifest.name,
        description: fields.manifest.description,
        permissions: JSON.stringify(fields.manifest.permissions),
        manifest: JSON.stringify(fields.manifest),
        status: fields.status,
        effectRef: fields.effectRef ?? null,
        ts,
      });
      return this.get(fields.manifest.id)!;
    },

    update(id: string, patch: CapabilityUpdateFields): CapabilityView | null {
      const row = db.prepare(`SELECT * FROM capability_packs WHERE id = ?`).get(id) as
        | CapabilityRow
        | undefined;
      if (!row) return null;
      db.prepare(
        `UPDATE capability_packs
         SET status = @status, effect_ref = @effectRef, last_error = @lastError, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        status: patch.status ?? row.status,
        effectRef: patch.effectRef !== undefined ? patch.effectRef : row.effect_ref,
        lastError: patch.lastError !== undefined ? patch.lastError : row.last_error,
        ts: nowIso(),
      });
      return this.get(id);
    },

    /** v2.12：升级时替换清单与版本元信息；状态回落 disabled，effect 由服务层重写 */
    replaceManifest(id: string, manifest: CapabilityManifest): CapabilityView | null {
      const row = db.prepare(`SELECT id FROM capability_packs WHERE id = ?`).get(id) as
        | { id: string }
        | undefined;
      if (!row) return null;
      db.prepare(
        `UPDATE capability_packs
         SET kind = @kind, version = @version, name = @name, description = @description,
             permissions_json = @permissions, manifest_json = @manifest,
             status = 'disabled', effect_ref = NULL, last_error = NULL, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        kind: manifest.kind,
        version: manifest.version,
        name: manifest.name,
        description: manifest.description,
        permissions: JSON.stringify(manifest.permissions),
        manifest: JSON.stringify(manifest),
        ts: nowIso(),
      });
      return this.get(id);
    },

    remove(id: string): boolean {
      return db.prepare(`DELETE FROM capability_packs WHERE id = ?`).run(id).changes > 0;
    },
  };
}

export type CapabilityRepository = ReturnType<typeof createCapabilityRepository>;
