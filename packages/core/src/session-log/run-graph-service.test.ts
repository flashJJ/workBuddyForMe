import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAgentRunRepository,
  createDatabase,
  createMeetingRepository,
  createTaskRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../secrets/cipher';
import { createSessionLogService } from './session-log-service';
import { createRunGraphService } from './run-graph-service';

const TS = '2026-11-03T00:00:00.000Z';

describe('v2.20 M2 RunGraph 快照服务', () => {
  let db: DatabaseInstance;
  let log: ReturnType<typeof createSessionLogService>;
  let service: ReturnType<typeof createRunGraphService>;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-run-graph-')));
    db = createDatabase(':memory:');
    const deps = { db, cipher: createWebCipher() };
    db.prepare(`INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`).run(TS, TS);
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`,
    ).run(TS, TS);
    log = createSessionLogService(deps);
    service = createRunGraphService(deps);
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('会话图聚合 chat + task + agent 事件', () => {
    log.recordChat('c1', 'message_started', { messageId: 'm1', role: 'user', content: '帮我整理' }, TS);

    const taskRun = createTaskRunRepository(db).createRun({
      conversationId: 'c1',
      assistantId: 'a1',
      goal: '整理文件',
      maxSteps: 20,
    });
    log.record({ scope: 'task', scopeId: taskRun.id, type: 'run_started', payload: { runId: taskRun.id, run: taskRun } });
    log.record({
      scope: 'task',
      scopeId: taskRun.id,
      type: 'step_started',
      payload: { runId: taskRun.id, step: { id: 's1', kind: 'action', toolName: 'file_list', status: 'running' } },
    });

    const agentRun = createAgentRunRepository(db).create({
      assistantId: 'a1',
      conversationId: 'c1',
      goal: '复核',
    });
    log.record({
      scope: 'agent',
      scopeId: agentRun.id,
      type: 'agent_phase',
      payload: { runId: agentRun.id, phase: 'planning', role: 'planner', round: 1 },
    });

    const graph = service.conversationGraph('c1');
    const ids = graph.nodes.map((node) => node.id);
    expect(ids).toContain('chat:c1:message:m1');
    expect(ids).toContain(`run:task:${taskRun.id}`);
    expect(ids).toContain(`task:${taskRun.id}:step:s1`);
    expect(ids).toContain(`run:agent:${agentRun.id}`);
    expect(ids).toContain(`agent:${agentRun.id}:round:1:planner`);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('会议图只聚合 meeting scope，并保留轮次/消息/状态', () => {
    const meeting = createMeetingRepository(db).create({
      topic: '评审',
      memberIds: ['a1'],
      mode: 'manual',
      modelId: null,
    });
    log.record({
      scope: 'meeting',
      scopeId: meeting.id,
      type: 'meeting_turn_start',
      payload: { meetingId: meeting.id, mode: 'manual', speakerIds: ['a1'], autoRounds: 0, turnIndex: 0 },
    });
    log.record({
      scope: 'meeting',
      scopeId: meeting.id,
      type: 'meeting_message',
      payload: {
        meetingId: meeting.id,
        message: { id: 'msg1', speakerName: '阿策', content: '你好' },
      },
    });
    log.record({
      scope: 'meeting',
      scopeId: meeting.id,
      type: 'meeting_status',
      payload: { meetingId: meeting.id, status: 'finished', mode: 'manual', autoRounds: 0 },
    });

    const graph = service.meetingGraph(meeting.id);
    expect(graph.rootKind).toBe('meeting');
    expect(graph.nodes.map((node) => node.id)).toContain(`meeting:${meeting.id}:turn:0`);
    expect(graph.nodes.map((node) => node.id)).toContain(`meeting:${meeting.id}:message:msg1`);
    expect(graph.nodes.find((node) => node.id === `meeting:${meeting.id}:status`)?.status).toBe('succeeded');
  });
});
