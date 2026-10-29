import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import type { AppSettings } from '@wbfm/shared/types';
import type { WorkSignal } from '@wbfm/shared';
import { createApprovalRegistry, type ApprovalRegistry } from '../work-signal/approval-registry';
import { DEFAULT_SETTINGS } from '../services/settings-service';
import {
  createSubagentProviderRegistry,
  type SubagentProvider,
  type SubagentProviderResult,
} from './subagent-provider';
import { createSubagentRunService, type SubagentRunService } from './subagent-run-service';

describe('v2.11 外部代理运行服务', () => {
  let db: DatabaseInstance;
  let service: SubagentRunService;
  let approvals: ApprovalRegistry;
  let dataRoot: string;
  let cwd: string;
  let settings: AppSettings;
  let providerRun: ReturnType<typeof vi.fn>;
  let provider: SubagentProvider;
  let signals: WorkSignal[];
  let events: Array<{ type: string; payload: unknown }>;
  let completed: string[];

  beforeEach(() => {
    dataRoot = mkdtempSync(join(tmpdir(), 'wbfm-sub-data-'));
    cwd = mkdtempSync(join(tmpdir(), 'wbfm-sub-cwd-'));
    db = createDatabase(':memory:');
    approvals = createApprovalRegistry();
    settings = {
      ...DEFAULT_SETTINGS,
      subagentCliEnabled: true,
      subagentCliCommand: 'node',
      subagentCliArgs: [],
      subagentCliTimeoutMs: 600_000,
      subagentCliMaxOutputBytes: 2_097_152,
    };
    providerRun = vi.fn(async (): Promise<SubagentProviderResult> => ({
      status: 'done',
      summary: 'fake done',
      outputBytes: 10,
    }));
    provider = {
      id: 'local-cli',
      label: 'fake',
      available: () => true,
      run: providerRun as unknown as SubagentProvider['run'],
    };
    signals = [];
    events = [];
    completed = [];
    service = createSubagentRunService({
      db,
      providers: createSubagentProviderRegistry(),
      approvals,
      workSignals: { ingestSubagent: (signal) => signals.push(signal) },
      sessionLog: {
        record: (input) => {
          events.push({ type: input.type, payload: input.payload });
          return null;
        },
      },
      completions: { completeSubagent: (run) => completed.push(run.id) },
      settings: { get: () => settings },
      dataRoot,
      providerFactory: () => provider,
      approvalTimeoutMs: 200,
    });
  });

  afterEach(() => {
    db.close();
  });

  it('允许审批 → 运行完成并写证据/回投', async () => {
    const run = service.start({ goal: '整理 README', cwd });
    expect(run.status).toBe('queued');
    expect(approvals.list()).toHaveLength(1);
    expect(approvals.resolve(run.id, { action: 'allow' })).toBe(true);

    const settled = await service.whenSettled(run.id);
    expect(settled.status).toBe('done');
    expect(settled.summary).toBe('fake done');
    expect(providerRun).toHaveBeenCalledTimes(1);
    expect(events.map((item) => item.type)).toEqual(['subagent_started', 'subagent_finished']);
    expect(signals.at(-1)?.outcome).toBe('succeeded');
    expect(completed).toEqual([run.id]);
  });

  it('拒绝审批 → cancelled(approval_denied)，不启动 provider', async () => {
    const run = service.start({ goal: '危险操作', cwd });
    expect(approvals.resolve(run.id, { action: 'deny' })).toBe(true);
    const settled = await service.whenSettled(run.id);
    expect(settled.status).toBe('cancelled');
    expect(settled.errorCode).toBe('approval_denied');
    expect(providerRun).not.toHaveBeenCalled();
    expect(events.map((item) => item.type)).toEqual(['subagent_finished']);
  });

  it('审批超时 → cancelled(approval_timeout)', async () => {
    const run = service.start({ goal: '等待审批', cwd });
    const settled = await service.whenSettled(run.id);
    expect(settled.status).toBe('cancelled');
    expect(settled.errorCode).toBe('approval_timeout');
  });

  it('取消排队中的运行 → cancelled(cancelled)', async () => {
    const run = service.start({ goal: '取消', cwd });
    service.cancel(run.id);
    const settled = await service.whenSettled(run.id);
    expect(settled.status).toBe('cancelled');
    expect(settled.errorCode).toBe('cancelled');
  });

  it('关闭开关立即取消在途运行', async () => {
    const run = service.start({ goal: '关闭', cwd });
    settings = { ...settings, subagentCliEnabled: false };
    service.refresh();
    const settled = await service.whenSettled(run.id);
    expect(settled.status).toBe('cancelled');
    expect(service.providers()).toEqual([]);
  });

  it('预算超限映射为 budget_exceeded', async () => {
    providerRun.mockResolvedValueOnce({
      status: 'failed',
      summary: '',
      error: '预算超限',
      errorCode: 'budget_exceeded',
      outputBytes: 5,
    });
    const run = service.start({ goal: '预算', cwd });
    approvals.resolve(run.id, { action: 'allow' });
    const settled = await service.whenSettled(run.id);
    expect(settled.status).toBe('budget_exceeded');
    expect(settled.errorCode).toBe('budget_exceeded');
  });

  it('提供方未启用时 start 422', () => {
    settings = { ...settings, subagentCliEnabled: false };
    expect(() => service.start({ goal: 'x', cwd })).toThrow(/未启用/);
  });
});
