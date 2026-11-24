import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  capabilityManifestSchema,
  capabilitySignaturePayload,
  type CapabilityTrustedKey,
} from '@wbfm/shared/schemas';
import {
  createDatabase,
  createFlowRunCompensationRepository,
  createSettingsRepository,
  createWorkflowRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { verifyCapabilitySignature, assertCapabilitySignatureAllowed } from '../../../capabilities/signature';
import { createFlowCompensationService } from '../compensation-service';
import { createFlowRetentionService } from '../retention-service';
import type { FlowRunReplayService } from '../run-replay-service';

/**
 * `pnpm selftest` 最小版（质量工程专项 F）：
 * 三个跨层场景，全部用真实文件库，由 scripts/selftest.mjs 逐个汇总 PASS/FAIL。
 * 标题必须保持 `[场景名]` 前缀，脚本按前缀匹配。
 */

const T0 = new Date('2026-11-24T00:00:00.000Z');

function withTempDatabase(fn: (db: DatabaseInstance) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'wbfm-selftest-'));
  const db = createDatabase(join(dir, 'selftest.db'));
  try {
    fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function stubReplay(): FlowRunReplayService {
  return {
    replayOne: () => ({ runId: '', parentRunId: null }),
    replayBatch: vi.fn(),
  } as unknown as FlowRunReplayService;
}

describe('selftest 核心场景', () => {
  it('[补偿重启恢复] 文件库重启后 retrying 收敛并沿用原触发方式续跑', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbfm-selftest-'));
    const file = join(dir, 'selftest.db');
    let dbA: DatabaseInstance | null = null;
    let dbB: DatabaseInstance | null = null;
    try {
      // 实例 A：留下 retrying，重放运行在退出时收敛为 interrupted
      dbA = createDatabase(file);
      const workflowsA = createWorkflowRepository(dbA);
      const runsA = createWorkflowRunRepository(dbA);
      const compensationsA = createFlowRunCompensationRepository(dbA);
      const wf = workflowsA.createWorkflow({ name: '自测' });
      const root = runsA.createRun({ workflowId: wf.id, version: 1, trigger: 'schedule' });
      runsA.finishRun(root.id, 'failed', { error: { code: 'network', message: 'reset' } });
      const serviceA = createFlowCompensationService({
        runs: runsA,
        compensations: compensationsA,
        workflows: workflowsA,
        replay: stubReplay(),
        now: () => new Date(T0),
      });
      serviceA.onRunTerminal(runsA.getRun(root.id)!);
      const item = compensationsA.getByRootRun(root.id)!;
      expect(compensationsA.claim(item.id, item.nextRetryAt!)).toBe(true);
      const retry = runsA.createRun({ workflowId: wf.id, version: 1, trigger: 'schedule' });
      compensationsA.markRetrying(item.id, retry.id);
      runsA.finishRun(retry.id, 'interrupted');
      dbA.close();
      dbA = null;

      // 实例 B：同一文件库重启后恢复
      dbB = createDatabase(file);
      const workflowsB = createWorkflowRepository(dbB);
      const runsB = createWorkflowRunRepository(dbB);
      const compensationsB = createFlowRunCompensationRepository(dbB);
      const replayOne = vi.fn((input: Parameters<FlowRunReplayService['replayOne']>[0]) => {
        const run = runsB.createRun({ workflowId: wf.id, version: 1, trigger: input.trigger });
        return { runId: run.id, parentRunId: root.id };
      });
      const replay = { replayOne, replayBatch: vi.fn() } as unknown as FlowRunReplayService;
      const serviceB = createFlowCompensationService({
        runs: runsB,
        compensations: compensationsB,
        workflows: workflowsB,
        replay,
        now: () => new Date(T0),
      });

      expect(serviceB.recover()).toEqual({
        recovered: 0,
        requeued: 1,
        exhausted: 0,
        cancelled: 0,
        skipped: 0,
      });
      const pending = compensationsB.getByRootRun(root.id)!;
      expect(pending).toMatchObject({ state: 'pending', attempt: 2 });

      const due = new Date(Date.parse(pending.nextRetryAt!));
      const serviceC = createFlowCompensationService({
        runs: runsB,
        compensations: compensationsB,
        workflows: workflowsB,
        replay,
        now: () => due,
      });
      expect(serviceC.sweep()).toMatchObject({ started: 1 });
      expect(replayOne).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'schedule' }));
      expect(compensationsB.getByRootRun(root.id)?.state).toBe('retrying');
    } finally {
      dbA?.close();
      dbB?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[能力包验签] 有效签名通过，清单被篡改后拒绝', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const manifest = capabilityManifestSchema.parse({
      id: 'com.example.selftest',
      version: '1.0.0',
      kind: 'skill',
      name: '自测签名',
      description: 'selftest',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [],
      checksums: { 'payload/skill.json': 'a'.repeat(64) },
      signatureKeyId: 'selftest-key',
    });
    const signature = sign(
      null,
      Buffer.from(capabilitySignaturePayload(manifest)),
      privateKey,
    ).toString('base64');
    const keys: CapabilityTrustedKey[] = [
      { id: 'selftest-key', label: '自测', publicKey: publicKeyPem, createdAt: T0.toISOString() },
    ];

    const signed = { ...manifest, signature };
    expect(verifyCapabilitySignature(signed, keys)).toMatchObject({
      status: 'valid',
      keyId: 'selftest-key',
    });

    const tampered = verifyCapabilitySignature({ ...signed, name: '被篡改' }, keys);
    expect(tampered.status).toBe('invalid');
    expect(() => assertCapabilitySignatureAllowed(tampered, 'require')).toThrow(/签名无效/);
  });

  it('[保留 dry-run] 过期运行只统计不删除，正式清理才落盘', () => {
    withTempDatabase((db) => {
      const workflows = createWorkflowRepository(db);
      const runs = createWorkflowRunRepository(db);
      const compensations = createFlowRunCompensationRepository(db);
      const settings = createSettingsRepository(db);
      const wf = workflows.createWorkflow({ name: '保留' });

      const expired = runs.createRun({ workflowId: wf.id, version: 1 });
      runs.finishRun(expired.id, 'succeeded');
      db.prepare(
        "UPDATE workflow_runs SET created_at = '2026-01-01T00:00:00.000Z', finished_at = '2026-01-01T00:00:00.000Z' WHERE id = ?",
      ).run(expired.id);
      const fresh = runs.createRun({ workflowId: wf.id, version: 1 });
      runs.finishRun(fresh.id, 'succeeded');

      const service = createFlowRetentionService({ runs, workflows, compensations, settings });
      const at = new Date('2026-11-24T00:00:00.000Z');

      expect(service.cleanup({ dryRun: true, now: at })).toMatchObject({
        removed: 1,
        dryRun: true,
      });
      expect(runs.getRun(expired.id)).not.toBeNull();

      expect(service.cleanup({ now: at })).toMatchObject({ removed: 1, dryRun: false });
      expect(runs.getRun(expired.id)).toBeNull();
      expect(runs.getRun(fresh.id)).not.toBeNull();
    });
  });
});
