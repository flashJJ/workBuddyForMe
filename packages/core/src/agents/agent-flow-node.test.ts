import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAgentRunRepository,
  createDatabase,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { AgentClients } from './index';
import { createAgentRunService, type AgentClientsProvider } from './agent-run-service';

/**
 * v1.4 M3 startFlowNode（Flow agent 节点入口）：
 * 建行回填 flow_run_id/node_execution_id、节点覆盖透传 provider、
 * 重跑即新建协作（不复制旧 run）、信号取消收敛。
 */
describe('agent-run-service.startFlowNode（Flow agent 节点）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-agent-flow-')));
    db = createDatabase(':memory:');
    // agent_runs.flow_run_id 外键：预置 workflow + workflow_run
    db.prepare(
      `INSERT INTO workflows(id,name,status,current_version,created_at,updated_at)
       VALUES('wf1','w','published',1,'t','t')`,
    ).run();
    for (const id of ['fr-1', 'fr-2', 'fr-3']) {
      db.prepare(
        `INSERT INTO workflow_runs(id,workflow_id,version,status,created_at)
         VALUES(?, 'wf1', 1, 'running', 't')`,
      ).run(id);
    }
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  function scriptedClients(): AgentClients {
    return {
      planner: {
        async plan() {
          return {
            subtask: { title: 't', brief: 'b', acceptance: ['a'] },
            usage: { promptTokens: 1, completionTokens: 1 },
          };
        },
      },
      executor: {
        async run() {
          return {
            outcome: { summary: '交付', evidence: [], toolCalls: [], unfinished: [] },
            usage: { promptTokens: 1, completionTokens: 1 },
            steps: 1,
          };
        },
      },
      reviewer: {
        async review() {
          return {
            review: { verdict: 'approve', acceptanceResults: [], reviewNotes: 'ok' },
            usage: { promptTokens: 1, completionTokens: 1 },
          };
        },
      },
    };
  }

  it('建行回填 flow 归属/预算/目标，节点覆盖透传 provider，终态可取', async () => {
    const seen: Parameters<AgentClientsProvider>[0][] = [];
    const provider: AgentClientsProvider = (ctx) => {
      seen.push(ctx);
      return scriptedClients();
    };
    const service = createAgentRunService({ db, clientsProvider: provider });

    const { runId, events } = await service.startFlowNode({
      goal: '查证报销制度',
      assistantId: null,
      knowledgeBaseIds: ['kb-9'],
      toolScopes: ['knowledge'],
      budget: { maxRounds: 2 },
      roleModelIds: { planner: 'mp', executor: null, reviewer: null },
      flowRunId: 'fr-1',
      nodeExecutionId: 'ag_1',
    });

    let final;
    for (;;) {
      const step = await events.next();
      if (step.done) {
        final = step.value;
        break;
      }
    }

    expect(final!.status).toBe('done');
    expect(final!.flowRunId).toBe('fr-1');
    expect(final!.nodeExecutionId).toBe('ag_1');
    expect(final!.conversationId).toBeNull();
    expect(final!.budget.maxRounds).toBe(2);
    expect(final!.budget.maxSteps).toBe(20); // 未覆盖回落默认
    expect(final!.goal).toBe('查证报销制度');

    expect(seen[0]!.overrides).toEqual({
      roleModelIds: { planner: 'mp', executor: null, reviewer: null },
      knowledgeBaseIds: ['kb-9'],
    });

    const row = createAgentRunRepository(db).getById(runId)!;
    expect(row.flowRunId).toBe('fr-1');
    expect(row.nodeExecutionId).toBe('ag_1');
  });

  it('重放（再次调用）创建新协作 run，不复制旧记录', async () => {
    const service = createAgentRunService({ db, clientsProvider: () => scriptedClients() });
    const first = await service.startFlowNode({
      goal: 'g',
      assistantId: null,
      knowledgeBaseIds: [],
      toolScopes: [],
      budget: {},
      roleModelIds: { planner: null, executor: null, reviewer: null },
      flowRunId: 'fr-2',
      nodeExecutionId: 'ag_2',
    });
    await first.events.next(); // 驱动到完成
    const second = await service.startFlowNode({
      goal: 'g',
      assistantId: null,
      knowledgeBaseIds: [],
      toolScopes: [],
      budget: {},
      roleModelIds: { planner: null, executor: null, reviewer: null },
      flowRunId: 'fr-2',
      nodeExecutionId: 'ag_2',
    });
    expect(second.runId).not.toBe(first.runId);
    const repo = createAgentRunRepository(db);
    expect(repo.list({ limit: 10 }).filter((r) => r.flowRunId === 'fr-2')).toHaveLength(2);
  });

  it('信号 abort：协作收敛为 cancelled', async () => {
    const service = createAgentRunService({
      db,
      clientsProvider: () => ({
        planner: {
          async plan() {
            return {
              subtask: { title: 't', brief: 'b', acceptance: ['a'] },
              usage: { promptTokens: 1, completionTokens: 1 },
            };
          },
        },
        executor: {
          async run(_input, signal) {
            await new Promise<void>((resolve) => {
              signal?.addEventListener('abort', () => resolve());
            });
            throw new Error('aborted');
          },
        },
        reviewer: {
          async review() {
            return {
              review: { verdict: 'approve', acceptanceResults: [] },
              usage: { promptTokens: 1, completionTokens: 1 },
            };
          },
        },
      }),
    });
    const controller = new AbortController();
    const { events } = await service.startFlowNode({
      goal: 'g',
      assistantId: null,
      knowledgeBaseIds: [],
      toolScopes: [],
      budget: {},
      roleModelIds: { planner: null, executor: null, reviewer: null },
      flowRunId: 'fr-3',
      nodeExecutionId: 'ag_3',
      signal: controller.signal,
    });
    controller.abort();
    for (;;) {
      const s = await events.next();
      if (s.done) {
        expect(s.value.status).toBe('cancelled');
        break;
      }
    }
  });

  it('无角色通道：抛 NOT_IMPLEMENTED ApiError', async () => {
    const service = createAgentRunService({ db });
    await expect(
      service.startFlowNode({
        goal: 'g',
        assistantId: null,
        knowledgeBaseIds: [],
        toolScopes: [],
        budget: {},
        roleModelIds: { planner: null, executor: null, reviewer: null },
        flowRunId: 'fr',
        nodeExecutionId: 'ag',
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
