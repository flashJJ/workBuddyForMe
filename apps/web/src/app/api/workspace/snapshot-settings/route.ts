import {
  FILE_SNAPSHOT_DEFAULTS,
  FILE_SNAPSHOT_MAX_BYTES,
  FILE_SNAPSHOT_QUOTA_BYTES,
  FILE_SNAPSHOT_RETENTION_DAYS,
} from '@wbfm/shared/constants';
import { fileSnapshotSettingsSchema } from '@wbfm/shared/schemas';
import { FILE_SNAPSHOT_SETTING_KEYS } from '@wbfm/core/workspace';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import type { ServiceContainer } from '@/lib/server/container-types';

export const dynamic = 'force-dynamic';

function read(services: ServiceContainer) {
  const settings = services.fileSafety.settings;
  return {
    enabled:
      settings.getJson<boolean>(FILE_SNAPSHOT_SETTING_KEYS.enabled, FILE_SNAPSHOT_DEFAULTS.enabled) !==
      false,
    maxBytes: settings.getJson<number>(
      FILE_SNAPSHOT_SETTING_KEYS.maxBytes,
      FILE_SNAPSHOT_MAX_BYTES,
    ),
    quotaBytes: settings.getJson<number>(
      FILE_SNAPSHOT_SETTING_KEYS.quotaBytes,
      FILE_SNAPSHOT_QUOTA_BYTES,
    ),
    retentionDays: settings.getJson<number>(
      FILE_SNAPSHOT_SETTING_KEYS.retentionDays,
      FILE_SNAPSHOT_RETENTION_DAYS,
    ),
  };
}

/** GET /api/workspace/snapshot-settings：快照开关与配额 */
export const GET = defineRoute(({ services }) => jsonOk(read(services)));

/** PUT /api/workspace/snapshot-settings：更新快照设置 */
export const PUT = defineRoute(async ({ request, services }) => {
  const body = parseBody(fileSnapshotSettingsSchema, await readJsonBody(request));
  const settings = services.fileSafety.settings;
  settings.setJson(FILE_SNAPSHOT_SETTING_KEYS.enabled, body.enabled);
  settings.setJson(FILE_SNAPSHOT_SETTING_KEYS.maxBytes, body.maxBytes);
  settings.setJson(FILE_SNAPSHOT_SETTING_KEYS.quotaBytes, body.quotaBytes);
  settings.setJson(FILE_SNAPSHOT_SETTING_KEYS.retentionDays, body.retentionDays);
  return jsonOk(read(services));
});
