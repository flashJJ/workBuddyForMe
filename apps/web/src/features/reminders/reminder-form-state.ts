import type {
  AgentUnattendedMode,
  ScheduledTaskCreateInput,
  ScheduledTaskView,
} from '@wbfm/shared/schemas';
import { isScheduledAgentTask } from '@wbfm/shared/schemas';
import { todayDateValue, toTimeValue } from './schedule-format';

/** v2.13 M4：提醒 / 定时 Agent 表单状态与初值（外迁守行数门禁） */

export type ReminderFormMode = 'reminder' | 'agent_task';
export type ReminderKind = ScheduledTaskCreateInput['kind'];

export interface ReminderFormState {
  mode: ReminderFormMode;
  assistantId: string;
  kind: ReminderKind;
  time: string;
  weekday: number;
  atDate: string;
  text: string;
  enabled: boolean;
  goal: string;
  conversationId: string;
  permissionMode: AgentUnattendedMode;
  workspacePath: string;
  notify: 'work_signal' | 'desktop' | 'none';
}

export function buildReminderForm(
  reminder: ScheduledTaskView | null,
  defaultAssistantId: string,
): ReminderFormState {
  if (reminder) {
    const agent = isScheduledAgentTask(reminder.payload) ? reminder.payload : null;
    return {
      mode: agent ? 'agent_task' : 'reminder',
      assistantId: reminder.assistantId,
      kind: reminder.kind,
      time: toTimeValue(reminder.hour, reminder.minute),
      weekday: reminder.weekday ?? 1,
      atDate: reminder.atDate ?? todayDateValue(),
      text: reminder.text,
      enabled: reminder.enabled,
      goal: agent?.goal ?? '',
      conversationId: agent?.conversationId ?? '',
      permissionMode: (agent?.permissionMode ?? 'confirm_each') as AgentUnattendedMode,
      workspacePath: agent?.workspacePath ?? '',
      notify: agent?.notify ?? 'work_signal',
    };
  }
  return {
    mode: 'reminder',
    assistantId: defaultAssistantId,
    kind: 'daily',
    time: '09:00',
    weekday: 1,
    atDate: todayDateValue(),
    text: '',
    enabled: true,
    goal: '',
    conversationId: '',
    permissionMode: 'confirm_each',
    workspacePath: '',
    notify: 'work_signal',
  };
}
