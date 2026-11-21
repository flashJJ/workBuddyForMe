import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createModelRepository,
  createProviderRepository,
  createSessionEventRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import type { ServiceDeps } from '../base/deps';
import { createProviderHealthService } from './provider-health-service';

const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() - offsetDays * day).toISOString();

describe('v4.19 供应商健康度', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let providerA: string;
  let providerB: string;
  let modelA: string;
  let modelB: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-health-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    const providers = createProviderRepository(db);
    const a = providers.create({
      name: '供应商 A',
      protocol: 'openai-compatible',
      baseUrl: 'http://a.local/v1',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 0,
    });
    const b = providers.create({
      name: '供应商 B',
      protocol: 'openai-compatible',
      baseUrl: 'http://b.local/v1',
      apiKeyCipher: null,
      enabled: true,
      sortOrder: 1,
    });
    providerA = a.id;
    providerB = b.id;
    const models = createModelRepository(db);
    modelA = models.create({
      providerId: providerA,
      modelId: 'a-chat',
      capabilities: ['chat'],
      contextWindow: 8192,
    }).id;
    modelB = models.create({
      providerId: providerB,
      modelId: 'b-chat',
      capabilities: ['chat'],
      contextWindow: 8192,
    }).id;
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('按供应商聚合失败与切换，未知模型归入未知分组，窗口外不计入', () => {
    const events = createSessionEventRepository(db);
    const add = (type: string, payload: unknown, offsetDays: number) =>
      events.append({ scope: 'chat', scopeId: 'c1', type, payload, createdAt: iso(offsetDays) });

    add('model_switched', { fromModelId: modelA, toModelId: modelB, reason: 'rate_limited' }, 1);
    add('message_error', { code: 'rate_limited', messageId: 'm1', modelId: modelA }, 2);
    add('message_error', { code: 'timeout', messageId: 'm2', modelId: modelB }, 3);
    add('message_error', { code: 'unknown', messageId: 'm3' }, 1);
    add('message_error', { code: 'timeout', messageId: 'm4', modelId: modelA }, 10);

    const health = createProviderHealthService({ db, cipher } as unknown as ServiceDeps);
    const report = health.get(7);

    const rowA = report.rows.find((row) => row.providerId === providerA)!;
    expect(rowA.failures).toEqual({ rate_limited: 1 });
    expect(rowA.failureTotal).toBe(1);
    expect(rowA.switches).toBe(1);
    expect(rowA.lastFailureAt).toBeTruthy();

    const rowB = report.rows.find((row) => row.providerId === providerB)!;
    expect(rowB.failures).toEqual({ timeout: 1 });

    const unknown = report.rows.find((row) => row.providerId === 'unknown')!;
    expect(unknown.failures).toEqual({ unknown: 1 });

    const longer = health.get(30);
    expect(longer.rows.find((row) => row.providerId === providerA)!.failureTotal).toBe(2);
    expect(longer.rows.find((row) => row.providerId === providerB)!.failureTotal).toBe(1);
  });

  it('无事件时仍返回已配置供应商，统计为零', () => {
    const health = createProviderHealthService({ db, cipher } as unknown as ServiceDeps);
    const report = health.get(7);
    expect(report.rows).toHaveLength(2);
    expect(report.rows.every((row) => row.failureTotal === 0 && row.switches === 0)).toBe(true);
  });

  it('模型删除后历史失败归入未知分组，不丢弃事件', () => {
    createSessionEventRepository(db).append({
      scope: 'chat',
      scopeId: 'c1',
      type: 'message_error',
      payload: { code: 'timeout', modelId: modelB },
      createdAt: iso(1),
    });
    createModelRepository(db).delete(modelB);

    const health = createProviderHealthService({ db, cipher } as unknown as ServiceDeps);
    const report = health.get(7);
    expect(report.rows.find((row) => row.providerId === providerB)!.failureTotal).toBe(0);
    expect(report.rows.find((row) => row.providerId === 'unknown')!.failures).toEqual({
      timeout: 1,
    });
  });
});
