'use client';

import * as React from 'react';
import { FolderOpen, Send, X } from 'lucide-react';
import type { AgentPermissionMode } from '@wbfm/shared/schemas';
import type { Conversation } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SimpleSelect } from '@/components/ui/simple-select';
import { NumberInput } from '@/components/ui/number-input';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useTaskMutations } from '@/lib/hooks/use-tasks';
import { useSettings } from '@/lib/hooks/use-settings';

const MODES: AgentPermissionMode[] = [
  'confirm_each',
  'auto_edits',
  'smart_approve',
  'plan_only',
  'full_access',
];

const MODE_LABEL_KEYS: Record<AgentPermissionMode, MessageKey> = {
  confirm_each: 'tasks.governance.modes.confirm_each',
  auto_edits: 'tasks.governance.modes.auto_edits',
  smart_approve: 'tasks.governance.modes.smart_approve',
  plan_only: 'tasks.governance.modes.plan_only',
  full_access: 'tasks.governance.modes.full_access',
};

const MODE_HINT_KEYS: Record<AgentPermissionMode, MessageKey> = {
  confirm_each: 'tasks.governance.modeHints.confirm_each',
  auto_edits: 'tasks.governance.modeHints.auto_edits',
  smart_approve: 'tasks.governance.modeHints.smart_approve',
  plan_only: 'tasks.governance.modeHints.plan_only',
  full_access: 'tasks.governance.modeHints.full_access',
};

interface Props {
  conversations: Conversation[];
  conversationId: string;
  onConversationChange: (id: string) => void;
  onCreated: (runId: string) => void;
}

/** v2.13 M1：任务启动表单（模式 / 工作目录 / 目标 / 步数） */
export function TaskStartForm({
  conversations,
  conversationId,
  onConversationChange,
  onCreated,
}: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const mutations = useTaskMutations();
  const { data: settings } = useSettings();
  const [goal, setGoal] = React.useState('');
  const [maxSteps, setMaxSteps] = React.useState(20);
  const [mode, setMode] = React.useState<AgentPermissionMode>('confirm_each');
  const [workspacePath, setWorkspacePath] = React.useState('');
  const [fullAccessAck, setFullAccessAck] = React.useState(false);
  const modeInitialized = React.useRef(false);

  React.useEffect(() => {
    if (modeInitialized.current) return;
    const defaultMode = settings?.agentPolicy?.defaultMode;
    if (defaultMode) {
      setMode(defaultMode);
      modeInitialized.current = true;
    }
  }, [settings]);

  const pickDirectory = () => {
    void window.wbfm?.dialog?.pickDirectory?.().then((picked) => {
      if (picked) setWorkspacePath(picked);
    });
  };

  const submit = async () => {
    if (!conversationId) {
      toast.error(t('tasks.conversationRequired'));
      return;
    }
    if (!goal.trim()) {
      toast.error(t('tasks.goalRequired'));
      return;
    }
    if (mode === 'full_access' && !fullAccessAck) {
      toast.error(t('tasks.governance.fullAccessRequired'));
      return;
    }
    try {
      const run = await mutations.create.mutateAsync({
        conversationId,
        goal: goal.trim(),
        maxSteps,
        permissionMode: mode,
        workspacePath: workspacePath.trim() ? workspacePath.trim() : null,
        ...(mode === 'full_access' ? { acknowledgeFullAccess: true } : {}),
      });
      setGoal('');
      onCreated(run.id);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'tasks.createFailed' }));
    }
  };

  return (
    <section className="border-b bg-card/50 px-6 py-4">
      <div className="grid gap-3 lg:grid-cols-[260px_200px_minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('tasks.conversationLabel')}</label>
          <SimpleSelect
            value={conversationId}
            onValueChange={onConversationChange}
            aria-label={t('tasks.conversationAria')}
          >
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || t('tasks.unnamedConversation')}
              </option>
            ))}
          </SimpleSelect>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {t('tasks.governance.modeLabel')}
          </label>
          <SimpleSelect
            value={mode}
            onValueChange={(value) => setMode(value as AgentPermissionMode)}
            aria-label={t('tasks.governance.modeAria')}
          >
            {MODES.map((item) => (
              <option key={item} value={item}>
                {t(MODE_LABEL_KEYS[item])}
              </option>
            ))}
          </SimpleSelect>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {t(MODE_HINT_KEYS[mode])}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('tasks.goalLabel')}</label>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={t('tasks.goalPlaceholder')}
            rows={2}
          />
        </div>

        <div className="flex flex-col items-stretch gap-1">
          <label className="text-xs text-muted-foreground">{t('tasks.maxStepsLabel')}</label>
          <div className="flex flex-wrap gap-2">
            <NumberInput
              value={maxSteps}
              onValueChange={setMaxSteps}
              min={1}
              max={50}
              className="shrink-0"
            />
            <Button className="shrink-0" onClick={submit} disabled={mutations.create.isPending}>
              <Send className="h-4 w-4" />
              {t('tasks.start')}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {t('tasks.governance.workspaceLabel')}
          </label>
          <div className="flex gap-2">
            <input
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              placeholder={t('tasks.governance.workspacePlaceholder')}
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-xs"
              aria-label={t('tasks.governance.workspaceAria')}
            />
            {typeof window !== 'undefined' && window.wbfm?.dialog?.pickDirectory ? (
              <Button type="button" variant="outline" size="sm" onClick={pickDirectory}>
                <FolderOpen className="h-4 w-4" />
                {t('tasks.governance.pickWorkspace')}
              </Button>
            ) : null}
            {workspacePath ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setWorkspacePath('')}
                aria-label={t('tasks.governance.clearWorkspace')}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">{t('tasks.governance.workspaceHint')}</p>
        </div>

        {mode === 'full_access' ? (
          <label className="flex items-start gap-2 text-xs text-warning">
            <input
              type="checkbox"
              checked={fullAccessAck}
              onChange={(e) => setFullAccessAck(e.target.checked)}
              className="mt-0.5"
            />
            {t('tasks.governance.fullAccessConfirm')}
          </label>
        ) : null}
      </div>
    </section>
  );
}
