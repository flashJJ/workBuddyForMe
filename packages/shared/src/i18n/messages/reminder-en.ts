/**
 * reminders namespace English copy (DeepPartial of zh-CN shape; see reminder.ts).
 * Weekday indices follow JS getDay (0 = Sunday).
 */
import type { DeepPartialMessages } from '../types';
import type { zhReminders } from './reminder';

export const enReminders: DeepPartialMessages<typeof zhReminders> = {
  title: 'Character reminders',
  description:
    'Let an assistant remind you in its own voice on schedule; falls back to a system notification when the window is hidden.',
  addAction: 'New reminder',
  empty: 'No reminders yet. Schedule the first nudge to get started.',
  createTitle: 'New reminder',
  editTitle: 'Edit reminder',
  saving: 'Saving…',
  assistantLabel: 'Reminder assistant',
  assistantPlaceholder: 'Choose who reminds you',
  repeatLabel: 'Repeat',
  kindOnce: 'Once',
  kindDaily: 'Daily',
  kindWeekly: 'Weekly',
  timeLabel: 'Time',
  weekdayLabel: 'Weekday',
  weekdayShort0: 'Sun',
  weekdayShort1: 'Mon',
  weekdayShort2: 'Tue',
  weekdayShort3: 'Wed',
  weekdayShort4: 'Thu',
  weekdayShort5: 'Fri',
  weekdayShort6: 'Sat',
  dateLabel: 'Date',
  textLabel: 'Message',
  textPlaceholder: 'e.g. Time to stand up and look far away~',
  enabledLabel: 'Enable this reminder',
  everydayAt: 'Daily',
  statusDone: 'Done',
  taskTypeLabel: 'Task type',
  taskTypeReminder: 'Reminder',
  taskTypeAgent: 'Agent task',
  taskTypeLocked: 'An existing task cannot change type; create a new one instead.',
  agentBadge: 'Agent',
  agentGoalLabel: 'Agent goal',
  agentGoalPlaceholder: 'e.g. organize today\u2019s invoices from Downloads by month',
  agentConversationLabel: 'Run conversation',
  agentConversationPlaceholder: 'Choose the conversation for this run',
  agentFieldsRequired: 'Fill in the agent goal and choose a conversation',
  agentModeLabel: 'Mode',
  agentNotifyLabel: 'Completion notice',
  agentWorkspaceLabel: 'Workspace (optional)',
  agentWorkspacePlaceholder: 'Absolute path; limits file / command operations only',
  agentWorkspacePick: 'Choose folder',
  agentBoundary:
    'Triggers only while the app process is alive. If all windows are closed, approvals may go unanswered and are denied after 5 minutes. WorkSignal is reliable; desktop notifications are best effort.',
  notifyWorkSignal: 'Work signal only',
  notifyDesktop: 'Work signal + desktop notification',
  notifyNone: 'No notification',
};
