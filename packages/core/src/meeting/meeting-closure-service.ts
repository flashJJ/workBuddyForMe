import {
  createAssistantRepository,
  createMeetingConclusionRepository,
  createMeetingRepository,
  type DatabaseInstance,
  type WorkflowRepository,
} from '@wbfm/database';
import type {
  MeetingActionItemReminderInput,
  MeetingActionItemRunFlowInput,
  ScheduledTaskCreateInput,
  ScheduledTaskView,
} from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import type {
  MeetingActionItemRecord,
  MeetingConclusionView,
  MeetingMessageRecord,
  MeetingRecord,
} from '@wbfm/shared/types';
import type { FlowRunService } from '../flow';
import type { SchedulesService } from '../scheduler';

export type MeetingExportLocale = 'zh' | 'en';

export interface MeetingClosureService {
  toReminder(
    meetingId: string,
    itemId: string,
    input: MeetingActionItemReminderInput,
  ): { reminder: ScheduledTaskView; actionItem: MeetingActionItemRecord };
  runFlow(
    meetingId: string,
    itemId: string,
    input: MeetingActionItemRunFlowInput,
  ): { runId: string; workflowId: string; actionItem: MeetingActionItemRecord };
  exportMarkdown(
    meetingId: string,
    locale?: MeetingExportLocale,
  ): { filename: string; markdown: string };
}

export interface MeetingClosureDeps {
  db: DatabaseInstance;
  workflows: WorkflowRepository;
  flowRunner: Pick<FlowRunService, 'createRun' | 'enqueueRun'>;
  schedules: Pick<SchedulesService, 'create'>;
}

const EXPORT_LABELS = {
  zh: {
    status: '状态',
    created: '创建时间',
    members: '参会成员',
    transcript: '会议转录',
    conclusion: '会议结论',
    summary: '摘要',
    decisions: '决策',
    openQuestions: '未决问题',
    actionItems: '行动项',
    noConclusion: '（尚未生成结论）',
    noActionItems: '（无行动项）',
    edited: '（已人工编辑）',
    statusActive: '进行中',
    statusFinished: '已结束',
    statusAborted: '已打断',
    owner: '负责人',
    due: '截止',
    user: '用户',
  },
  en: {
    status: 'Status',
    created: 'Created',
    members: 'Members',
    transcript: 'Transcript',
    conclusion: 'Conclusion',
    summary: 'Summary',
    decisions: 'Decisions',
    openQuestions: 'Open questions',
    actionItems: 'Action items',
    noConclusion: '(No conclusion yet)',
    noActionItems: '(No action items)',
    edited: '(edited)',
    statusActive: 'Active',
    statusFinished: 'Finished',
    statusAborted: 'Aborted',
    owner: 'Owner',
    due: 'Due',
    user: 'User',
  },
} as const;

function zonedParts(iso: string, timeZone: string): { atDate: string; hour: number; minute: number } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw ApiError.validation('截止时间格式不合法');
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    throw ApiError.validation(`不支持的时区：${timeZone}`);
  }
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const hour = Number(get('hour'));
  return {
    atDate: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: Number(get('minute')),
  };
}

function clipReminderText(text: string): string {
  return text.length <= 200 ? text : `${text.slice(0, 199)}…`;
}

function statusLabel(locale: MeetingExportLocale, status: MeetingRecord['status']): string {
  const labels = EXPORT_LABELS[locale];
  return {
    active: labels.statusActive,
    finished: labels.statusFinished,
    aborted: labels.statusAborted,
  }[status];
}

function renderMarkdown(
  meeting: MeetingRecord,
  messages: MeetingMessageRecord[],
  view: MeetingConclusionView,
  memberNames: Map<string, string>,
  locale: MeetingExportLocale,
): string {
  const l = EXPORT_LABELS[locale];
  const lines: string[] = [
    `# ${meeting.topic}`,
    '',
    `- ${l.status}: ${statusLabel(locale, meeting.status)}`,
    `- ${l.created}: ${meeting.createdAt}`,
    `- ${l.members}: ${meeting.memberIds.map((id) => memberNames.get(id) ?? id).join('、')}`,
    '',
    `## ${l.transcript}`,
    '',
  ];
  for (const message of messages) {
    const speaker = message.speakerKind === 'user' ? l.user : message.speakerName;
    lines.push(`**${speaker}**：${message.content}`, '');
  }

  lines.push(`## ${l.conclusion}`, '');
  if (!view.conclusion) {
    lines.push(l.noConclusion, '');
  } else {
    lines.push(`### ${l.summary}`, '', view.conclusion.summary, '');
    lines.push(`### ${l.decisions}`, '');
    if (view.conclusion.decisions.length === 0) lines.push('- —');
    for (const decision of view.conclusion.decisions) lines.push(`- ${decision}`);
    lines.push('', `### ${l.openQuestions}`, '');
    if (view.conclusion.openQuestions.length === 0) lines.push('- —');
    for (const question of view.conclusion.openQuestions) lines.push(`- ${question}`);
    lines.push('');
    if (view.conclusion.editedAt) lines.push(l.edited, '');
  }

  lines.push(`## ${l.actionItems}`, '');
  if (view.actionItems.length === 0) lines.push(l.noActionItems, '');
  for (const item of view.actionItems) {
    const box = item.status === 'done' ? 'x' : item.status === 'cancelled' ? '-' : ' ';
    const owner = item.ownerLabel ? ` · ${l.owner}: ${item.ownerLabel}` : '';
    const due = item.dueAt ? ` · ${l.due}: ${item.dueAt}` : '';
    lines.push(`- [${box}] ${item.content}${owner}${due}`);
  }
  return `${lines.join('\n')}\n`;
}

export function createMeetingClosureService(deps: MeetingClosureDeps): MeetingClosureService {
  const meetings = createMeetingRepository(deps.db);
  const conclusions = createMeetingConclusionRepository(deps.db);
  const assistants = createAssistantRepository(deps.db);

  function requireFinishedMeeting(meetingId: string): MeetingRecord {
    const meeting = meetings.findById(meetingId);
    if (!meeting) throw ApiError.notFound('会议', meetingId);
    if (meeting.status !== 'finished') throw ApiError.conflict('会议结束后才能转换行动项');
    return meeting;
  }

  function requireItem(meetingId: string, itemId: string): MeetingActionItemRecord {
    const item = conclusions.getActionItem(meetingId, itemId);
    if (!item) throw ApiError.notFound('行动项', itemId);
    return item;
  }

  return {
    toReminder(meetingId, itemId, input) {
      const meeting = requireFinishedMeeting(meetingId);
      const item = requireItem(meetingId, itemId);
      if (item.linkedReminderId) throw ApiError.conflict('该行动项已转提醒');
      if (!item.dueAt) throw ApiError.validation('行动项没有截止时间，不能转提醒');
      if (!meeting.memberIds.includes(input.assistantId)) {
        throw ApiError.validation('提醒助手必须是本会议成员');
      }
      const { atDate, hour, minute } = zonedParts(item.dueAt, input.timezone);
      const payload: ScheduledTaskCreateInput = {
        assistantId: input.assistantId,
        kind: 'once',
        hour,
        minute,
        atDate,
        timezone: input.timezone,
        text: clipReminderText(item.content),
      };
      const reminder = deps.schedules.create(payload);
      const linked = conclusions.linkReminder(meetingId, itemId, reminder.id);
      if (!linked) throw ApiError.notFound('行动项', itemId);
      return { reminder, actionItem: linked };
    },

    runFlow(meetingId, itemId, input) {
      requireFinishedMeeting(meetingId);
      const item = requireItem(meetingId, itemId);
      if (item.linkedFlowRunId) throw ApiError.conflict('该行动项已运行过 Flow');
      const workflow = deps.workflows.getWorkflow(input.workflowId);
      if (!workflow) throw ApiError.notFound('工作流', input.workflowId);
      if (workflow.status === 'disabled' || (workflow.publishedVersion === null && workflow.status !== 'published')) {
        throw ApiError.validation('只能运行已发布 Flow');
      }
      const runInput = input.input ?? {
        actionItem: item.content,
        query: item.content,
        topic: item.content,
        question: item.content,
      };
      const runId = deps.flowRunner.createRun({
        workflowId: input.workflowId,
        input: runInput,
        trigger: 'manual',
      });
      deps.flowRunner.enqueueRun(runId);
      const linked = conclusions.linkFlowRun(meetingId, itemId, runId);
      if (!linked) throw ApiError.notFound('行动项', itemId);
      return { runId, workflowId: input.workflowId, actionItem: linked };
    },

    exportMarkdown(meetingId, locale = 'zh') {
      const meeting = meetings.findById(meetingId);
      if (!meeting) throw ApiError.notFound('会议', meetingId);
      const messages = meetings.listMessages(meetingId);
      const view: MeetingConclusionView = {
        conclusion: conclusions.getConclusion(meetingId),
        actionItems: conclusions.listActionItems(meetingId),
      };
      const memberNames = new Map<string, string>(
        meeting.memberIds.map((id) => [id, assistants.findById(id)?.name ?? id]),
      );
      return {
        filename: `meeting-${meetingId}.md`,
        markdown: renderMarkdown(meeting, messages, view, memberNames, locale),
      };
    },
  };
}
