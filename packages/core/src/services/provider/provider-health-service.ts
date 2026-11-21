import {
  createModelRepository,
  createProviderRepository,
  createSessionEventRepository,
} from '@wbfm/database';
import type { ProviderHealthReport, ProviderHealthRow } from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../base/deps';

const UNKNOWN_PROVIDER = 'unknown';
const MAX_EVENTS = 5000;

/**
 * v4.19：供应商健康度（本机事件代理指标）。
 *
 * 数据源只有两类会话事件：`model_switched`（来源模型）与 `message_error`（目标模型）。
 * 不记录、不读取正文；模型或供应商已删除时归入「未知供应商」，不丢弃事件。
 */
export function createProviderHealthService(deps: ServiceDeps) {
  const events = createSessionEventRepository(deps.db);
  const models = createModelRepository(deps.db);
  const providers = createProviderRepository(deps.db);

  const rowFor = (rows: Map<string, ProviderHealthRow>, modelId: string | null) => {
    const model = modelId ? models.findById(modelId) : null;
    const provider = model ? providers.get(model.providerId) : null;
    const key = provider?.id ?? UNKNOWN_PROVIDER;
    const existing = rows.get(key);
    if (existing) return existing;
    const created: ProviderHealthRow = {
      providerId: key,
      providerName: provider?.name ?? '未知供应商',
      enabled: provider?.enabled ?? null,
      failures: {},
      failureTotal: 0,
      switches: 0,
      lastFailureAt: null,
    };
    rows.set(key, created);
    return created;
  };

  return {
    get(days = 7): ProviderHealthReport {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const rows = new Map<string, ProviderHealthRow>();
      for (const provider of providers.list()) {
        rows.set(provider.id, {
          providerId: provider.id,
          providerName: provider.name,
          enabled: provider.enabled,
          failures: {},
          failureTotal: 0,
          switches: 0,
          lastFailureAt: null,
        });
      }

      const list = events.listByTypesSince(['model_switched', 'message_error'], since, MAX_EVENTS);
      for (const event of list) {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        if (event.type === 'model_switched') {
          const fromModelId = typeof payload.fromModelId === 'string' ? payload.fromModelId : null;
          rowFor(rows, fromModelId).switches += 1;
          continue;
        }
        const modelId = typeof payload.modelId === 'string' ? payload.modelId : null;
        const code = typeof payload.code === 'string' && payload.code ? payload.code : 'unknown';
        const row = rowFor(rows, modelId);
        row.failures[code] = (row.failures[code] ?? 0) + 1;
        row.failureTotal += 1;
        if (!row.lastFailureAt || event.createdAt > row.lastFailureAt) {
          row.lastFailureAt = event.createdAt;
        }
      }

      return {
        days,
        since,
        rows: [...rows.values()].sort(
          (a, b) =>
            b.failureTotal + b.switches - (a.failureTotal + a.switches) ||
            a.providerName.localeCompare(b.providerName),
        ),
      };
    },
  };
}
