import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAssistantRepository,
  createDatabase,
  createMeetingConclusionRepository,
  createMeetingRepository,
  type DatabaseInstance,
  type WorkflowRepository,
} from '@wbfm/database';
import { assistantCreateSchema, type ScheduledTaskView } from '@wbfm/shared/schemas';
import type { FlowRunService } from '../flow';
import type { SchedulesService } from '../scheduler';
import { createMeetingClosureService } from './meeting-closure-service';

describe('v2.6 M3 meeting-closure-service', () => {
  let db: DatabaseInstance;
  let meetingId: string;
  let memberA: string;
  let memberB: string;
  let itemId: string;
  const schedulesCreated: unknown[] = [];
  const enqueued: string[] = [];
  let workflowStatus: 'published' | 'draft' = 'published';

  const schedules = {
    create(input: unknown) {
      schedulesCreated.push(input);
      return { id: 'r1', ...(input as object) } as ScheduledTaskView;
    },
  } as Pick<SchedulesService, 'create'>;

  const workflows = {
    getWorkflow(id: string) {
      return { id, status: workflowStatus } as ReturnType<WorkflowRepository['getWorkflow']>;
    },
  } as unknown as WorkflowRepository;

  const flowRunner = {
    createRun: vi.fn(() => 'run-1'),
    enqueueRun: vi.fn((runId: string) => enqueued.push(runId)),
  } as unknown as Pick<FlowRunService, 'createRun' | 'enqueueRun'>;

  function service() {
    return createMeetingClosureService({ db, workflows, flowRunner, schedules });
  }

  beforeEach(() => {
    db = createDatabase(':memory:');
    const assistants = createAssistantRepository(db);
    memberA = assistants.create({
      ...assistantCreateSchema.parse({ name: '阿策' }),
      isBuiltin: false,
      sortOrder: 0,
    }).id;
    memberB = assistants.create({
      ...assistantCreateSchema.parse({ name: '阿审' }),
      isBuiltin: false,
      sortOrder: 1,
    }).id;
    const meetings = createMeetingRepository(db);
    const meeting = meetings.create({
      topic: '评审方案',
      memberIds: [memberA, memberB],
      mode: 'manual',
      modelId: null,
    });
    meetingId = meeting.id;
    meetings.appendMessage({
      meetingId,
      speakerKind: 'user',
      speakerId: null,
      speakerName: '用户',
      content: '讨论方案 A',
    });
    meetings.finalize(meetingId, 'finished');
    itemId = createMeetingConclusionRepository(db).createActionItem(meetingId, {
      content: '补充测试',
      ownerLabel: '阿策',
      ownerMemberId: memberA,
      dueAt: '2026-11-01T01:30:00.000Z',
    }).id;
    schedulesCreated.length = 0;
    enqueued.length = 0;
    workflowStatus = 'published';
    vi.clearAllMocks();
  });
  afterEach(() => db.close());

  it('转提醒：按 Asia/Shanghai 换算墙钟并回链；重复转换 409', () => {
    const result = service().toReminder(meetingId, itemId, {
      assistantId: memberA,
      timezone: 'Asia/Shanghai',
    });
    expect(schedulesCreated[0]).toMatchObject({
      assistantId: memberA,
      kind: 'once',
      atDate: '2026-11-01',
      hour: 9,
      minute: 30,
      timezone: 'Asia/Shanghai',
      text: '补充测试',
    });
    expect(result.actionItem.linkedReminderId).toBe('r1');
    expect(() =>
      service().toReminder(meetingId, itemId, {
        assistantId: memberA,
        timezone: 'Asia/Shanghai',
      }),
    ).toThrow(/已转提醒/);
  });

  it('转提醒：无截止时间/非会议成员拒绝', () => {
    const noDue = createMeetingConclusionRepository(db).createActionItem(meetingId, {
      content: '无截止',
      ownerLabel: '',
      ownerMemberId: null,
      dueAt: null,
    });
    expect(() =>
      service().toReminder(meetingId, noDue.id, {
        assistantId: memberA,
        timezone: 'Asia/Shanghai',
      }),
    ).toThrow(/没有截止时间/);
    expect(() =>
      service().toReminder(meetingId, itemId, {
        assistantId: 'ghost',
        timezone: 'Asia/Shanghai',
      }),
    ).toThrow(/必须是本会议成员/);
  });

  it('运行 Flow：已发布校验、默认输入映射、入队与回链；重复运行 409', () => {
    const result = service().runFlow(meetingId, itemId, { workflowId: 'wf1' });
    expect(flowRunner.createRun).toHaveBeenCalledWith({
      workflowId: 'wf1',
      input: {
        actionItem: '补充测试',
        query: '补充测试',
        topic: '补充测试',
        question: '补充测试',
      },
      trigger: 'manual',
    });
    expect(enqueued).toEqual(['run-1']);
    expect(result.actionItem.linkedFlowRunId).toBe('run-1');
    expect(() => service().runFlow(meetingId, itemId, { workflowId: 'wf1' })).toThrow(
      /已运行过/,
    );

    const other = createMeetingConclusionRepository(db).createActionItem(meetingId, {
      content: '另一个行动项',
      ownerLabel: '',
      ownerMemberId: null,
      dueAt: null,
    });
    workflowStatus = 'draft';
    expect(() => service().runFlow(meetingId, other.id, { workflowId: 'wf1' })).toThrow(
      /已发布/,
    );
  });

  it('导出 Markdown：含转录/结论/行动项，en 标签与取消勾选', () => {
    const conclusions = createMeetingConclusionRepository(db);
    conclusions.saveGeneratedConclusion(
      {
        meetingId,
        summary: '采用方案 A',
        decisions: ['先做后端'],
        openQuestions: ['UI 排期'],
        modelId: null,
      },
      [],
    );
    conclusions.createActionItem(meetingId, {
      content: '人工补充',
      ownerLabel: '用户',
      ownerMemberId: null,
      dueAt: null,
    });
    const all = conclusions.listActionItems(meetingId);
    conclusions.updateActionItem(meetingId, all[0]!.id, { status: 'cancelled' });

    const { filename, markdown } = service().exportMarkdown(meetingId, 'en');
    expect(filename).toBe(`meeting-${meetingId}.md`);
    expect(markdown).toContain('# 评审方案');
    expect(markdown).toContain('**User**：讨论方案 A');
    expect(markdown).toContain('## Conclusion');
    expect(markdown).toContain('采用方案 A');
    expect(markdown).toContain('- [-]');
    expect(markdown).toContain('## Action items');
  });
});
