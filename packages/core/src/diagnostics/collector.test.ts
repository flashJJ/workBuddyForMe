import { describe, expect, it } from 'vitest';
import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityView } from '@wbfm/shared/schemas';
import {
  createDatabase,
  createSessionEventRepository,
  createTaskRunRepository,
} from '@wbfm/database';
import { createAuditService } from '../governance/audit';
import { DEFAULT_SETTINGS } from '../services/settings-service';
import { collectDiagnostics } from './collector';

const SENTINEL = 'sk-sentinel-secret-should-not-leak';
const URL_SECRET = 'https://internal.example.com/secret';
const PATH_SECRET = 'C:\\Users\\alice\\private\\project';

function readJson(files: Array<{ path: string; content: string }>, path: string) {
  const file = files.find((item) => item.path === path);
  if (!file) throw new Error(`missing ${path}`);
  return JSON.parse(file.content) as Record<string, unknown>;
}

describe('collectDiagnostics（v2.14）', () => {
  it('白名单内容 + 哨兵密钥 / URL / 绝对路径零命中', () => {
    const db = createDatabase(':memory:');
    const tasks = createTaskRunRepository(db);
    const sessions = createSessionEventRepository(db);
    const audit = createAuditService(db);

    const runA = tasks.createRun({
      conversationId: null,
      assistantId: 'assistant-1',
      goal: '整理周报',
      maxSteps: 20,
      workspacePath: PATH_SECRET,
      originScheduledTaskId: 'schedule-1',
    });
    const runB = tasks.createRun({
      conversationId: null,
      assistantId: 'assistant-1',
      goal: '另一任务',
      maxSteps: 10,
    });
    tasks.updateRunStatus(runA.id, 'completed');

    sessions.append({
      scope: 'task',
      scopeId: runB.id,
      type: 'task_error',
      payload: {
        apiKey: SENTINEL,
        error: { code: 'PROVIDER_ERROR', message: `${SENTINEL} ${URL_SECRET} ${PATH_SECRET}` },
      },
    });

    audit.append({ kind: 'run_started', actor: 'agent', runId: runA.id });
    audit.append({ kind: 'run_finished', actor: 'agent', runId: runA.id });
    db.prepare('UPDATE audit_events SET hash = ? WHERE seq = 2').run('broken');

    const capability = {
      id: 'cap.demo',
      kind: 'skill',
      version: '1.0.0',
      name: '演示',
      description: '',
      permissions: [],
      status: 'enabled',
      effectRef: 'demo',
      lastError: null,
      installedAt: 't',
      updatedAt: 't',
    } as CapabilityView;

    const bundle = collectDiagnostics({
      db,
      settings: { ...DEFAULT_SETTINGS, globalAppendPrompt: SENTINEL },
      audit,
      capabilities: {
        list: () => [capability],
        health: () => ({
          checkedAt: 't',
          packs: [
            {
              id: 'cap.demo',
              status: 'warning',
              issues: [{ code: 'checksum_mismatch', severity: 'warn', message: 'x' }],
            },
          ],
          orphans: [],
        }),
      },
      sessions: {
        listAll: ({ limit }) => createSessionEventRepository(db).listAll({ limit }),
      },
    });

    const paths = bundle.files.map((file) => file.path);
    expect(paths).toEqual([
      'versions.json',
      'audit-verify.json',
      'capabilities.json',
      'runs-summary.json',
      'settings-summary.json',
      'errors.log',
      'README.txt',
      'manifest.json',
    ]);
    expect(bundle.manifest.entries).toHaveLength(7);

    const all = bundle.files.map((file) => file.content).join('\n');
    expect(all).not.toContain(SENTINEL);
    expect(all).not.toContain(URL_SECRET);
    expect(all).not.toContain(PATH_SECRET);
    expect(all).not.toContain(runA.id);
    expect(all).not.toContain(runB.id);
    expect(all).not.toContain('conv-1');

    const verify = readJson(bundle.files, 'audit-verify.json');
    expect(verify).toMatchObject({ ok: false, firstBrokenSeq: 2, truncated: false });

    const runs = readJson(bundle.files, 'runs-summary.json');
    expect(runs).toMatchObject({
      windowDays: 7,
      totalRunCount: 2,
      scheduledRunCount: 1,
      byStatus: { completed: 1, queued: 1 },
    });

    const settings = readJson(bundle.files, 'settings-summary.json');
    expect(settings.workspaceConfigured).toBe(true);
    expect(settings.policyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(settings).not.toHaveProperty('globalAppendPrompt');

    const errors = bundle.files.find((file) => file.path === 'errors.log')!.content;
    expect(errors).toContain('task_error');
    expect(errors).toContain('PROVIDER_ERROR');
    expect(errors.split('\n')).toHaveLength(1);

    const capabilities = JSON.parse(
      bundle.files.find((file) => file.path === 'capabilities.json')!.content,
    ) as Array<{ id: string; healthIssues: string[] }>;
    expect(capabilities[0]).toMatchObject({
      id: 'cap.demo',
      healthIssues: ['checksum_mismatch'],
    });
    db.close();
  });

  it('审计校验可只读最近 N 条且不写回事件', () => {
    const db = createDatabase(':memory:');
    const audit = createAuditService(db);
    audit.append({ kind: 'run_started', actor: 'agent' });
    audit.append({ kind: 'run_finished', actor: 'agent' });
    audit.append({ kind: 'policy_updated', actor: 'user' });
    const before = audit.count();
    const result = audit.verify({ record: false, maxEvents: 2 });
    expect(result).toMatchObject({ ok: true, checked: 2, firstBrokenSeq: null });
    expect(audit.count()).toBe(before);
    db.close();
  });

  it('超时预算：立即返回 DIAGNOSTICS_TIMEOUT(503)', () => {
    const db = createDatabase(':memory:');
    const error = (() => {
      try {
        collectDiagnostics(
          { db, settings: DEFAULT_SETTINGS },
          { timeoutMs: 0 },
        );
        return null;
      } catch (caught) {
        return caught as ApiError;
      }
    })();
    expect(error).toMatchObject({ code: 'DIAGNOSTICS_TIMEOUT', status: 503 });
    db.close();
  });
});
