'use client';

import * as React from 'react';
import { FolderOpen } from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';
import {
  AGENT_UNATTENDED_MODES,
  type AgentPermissionMode,
  type AgentUnattendedMode,
} from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useConversations } from '@/lib/hooks/use-conversations';
import { useSettings } from '@/lib/hooks/use-settings';

const MODE_KEYS: Record<AgentPermissionMode, MessageKey> = {
  confirm_each: 'tasks.governance.modes.confirm_each',
  auto_edits: 'tasks.governance.modes.auto_edits',
  smart_approve: 'tasks.governance.modes.smart_approve',
  plan_only: 'tasks.governance.modes.plan_only',
  full_access: 'tasks.governance.modes.full_access',
};

const INPUT = 'h-9 w-full rounded-md border bg-background px-2 text-sm';

export interface AgentTaskFieldsValue {
  goal: string;
  conversationId: string;
  permissionMode: AgentUnattendedMode;
  workspacePath: string;
  notify: 'work_signal' | 'desktop' | 'none';
}

interface Props {
  assistantId: string;
  value: AgentTaskFieldsValue;
  onChange: (patch: Partial<AgentTaskFieldsValue>) => void;
}

/** v2.13 M4：定时 Agent 字段（目标 / 会话 / 无人值守模式 / 工作目录 / 通知） */
export function AgentTaskFields({ assistantId, value, onChange }: Props) {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const { data: conversations } = useConversations(assistantId || undefined);
  const allowed = settings?.agentPolicy?.unattended.allowedModes;
  const modes = AGENT_UNATTENDED_MODES.filter((mode) => (allowed ? allowed.includes(mode) : true));

  const pickDirectory = () => {
    void window.wbfm?.dialog?.pickDirectory?.().then((picked) => {
      if (picked) onChange({ workspacePath: picked });
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('reminders.agentGoalLabel')}</span>
        <textarea
          value={value.goal}
          required
          maxLength={2000}
          rows={3}
          data-testid="reminder-agent-goal"
          placeholder={t('reminders.agentGoalPlaceholder')}
          onChange={(event) => onChange({ goal: event.target.value })}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('reminders.agentConversationLabel')}</span>
        <SimpleSelect
          className={INPUT}
          value={value.conversationId}
          data-testid="reminder-agent-conversation"
          onValueChange={(next) => onChange({ conversationId: next })}
        >
          <option value="" disabled>
            {t('reminders.agentConversationPlaceholder')}
          </option>
          {(conversations ?? []).map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title}
            </option>
          ))}
        </SimpleSelect>
      </label>

      <div className="flex gap-2">
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">{t('reminders.agentModeLabel')}</span>
          <SimpleSelect
            className={INPUT}
            value={value.permissionMode}
            data-testid="reminder-agent-mode"
            onValueChange={(next) => onChange({ permissionMode: next as AgentUnattendedMode })}
          >
            {modes.map((mode) => (
              <option key={mode} value={mode}>
                {t(MODE_KEYS[mode])}
              </option>
            ))}
          </SimpleSelect>
        </label>
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">{t('reminders.agentNotifyLabel')}</span>
          <SimpleSelect
            className={INPUT}
            value={value.notify}
            data-testid="reminder-agent-notify"
            onValueChange={(next) =>
              onChange({ notify: next as AgentTaskFieldsValue['notify'] })
            }
          >
            <option value="work_signal">{t('reminders.notifyWorkSignal')}</option>
            <option value="desktop">{t('reminders.notifyDesktop')}</option>
            <option value="none">{t('reminders.notifyNone')}</option>
          </SimpleSelect>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('reminders.agentWorkspaceLabel')}</span>
        <div className="flex gap-2">
          <input
            className={INPUT}
            value={value.workspacePath}
            placeholder={t('reminders.agentWorkspacePlaceholder')}
            data-testid="reminder-agent-workspace"
            onChange={(event) => onChange({ workspacePath: event.target.value })}
          />
          <Button type="button" size="sm" variant="outline" onClick={pickDirectory}>
            <FolderOpen className="h-4 w-4" />
            {t('reminders.agentWorkspacePick')}
          </Button>
        </div>
      </label>

      <p className="text-[11px] text-muted-foreground">{t('reminders.agentBoundary')}</p>
    </div>
  );
}
