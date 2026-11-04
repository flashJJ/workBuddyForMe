'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { BranchCreatePayload } from '../hooks/use-branches';

interface Props {
  defaultGoal?: string;
  /** 预填标题（来自消息分支入口时可留空） */
  defaultTitle?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (payload: BranchCreatePayload) => void;
  onCancel?: () => void;
}

/** v2.21：派生分支表单；默认 autoStart=true，契约 §7 */
export function BranchCreateForm({ defaultGoal = '', defaultTitle = '', busy, error, onSubmit, onCancel }: Props) {
  const { t } = useI18n();
  const [goal, setGoal] = React.useState(defaultGoal);
  const [title, setTitle] = React.useState(defaultTitle);
  const [autoStart, setAutoStart] = React.useState(true);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const trimmed = goal.trim();
    if (!trimmed || busy) return;
    onSubmit({ goal: trimmed, title: title.trim() || undefined, autoStart });
  };

  return (
    <form className="space-y-2" onSubmit={submit} data-testid="branch-create-form">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{t('branch.create.goal')}</span>
        <Textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder={t('branch.create.goalPlaceholder')}
          rows={3}
          required
          data-testid="branch-goal-input"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{t('branch.create.titleField')}</span>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('branch.create.titlePlaceholder')}
          maxLength={40}
          data-testid="branch-title-input"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={autoStart}
          onChange={(event) => setAutoStart(event.target.checked)}
          data-testid="branch-autostart-input"
        />
        {t('branch.create.autoStart')}
      </label>
      {error && <p className="text-xs text-destructive break-words">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !goal.trim()} data-testid="branch-create-submit">
          {t('branch.create.submit')}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('branch.create.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
