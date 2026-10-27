'use client';

import * as React from 'react';
import { Download, Pencil, RefreshCw, Sparkles } from 'lucide-react';
import { DEFAULT_SCHEDULE_TIMEZONE } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';
import { errorText } from '@/lib/i18n/resolve-error';
import { useMeetingConclusion } from './use-meeting-conclusion';
import { MeetingActionItems } from './meeting-action-items';

interface Member {
  id: string;
  name: string;
  missing?: boolean;
}

const lines = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** v2.6 M3：会议结束后的结论生成、编辑、行动项闭环与导出 */
export function MeetingConclusionPanel({
  meetingId,
  members,
}: {
  meetingId: string;
  members: Member[];
}) {
  const { t, locale } = useI18n();
  const intl = useIntl();
  const toast = useToast();
  const confirm = useConfirm();
  const conclusion = useMeetingConclusion(meetingId);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState('');
  const [decisions, setDecisions] = React.useState('');
  const [questions, setQuestions] = React.useState('');

  const current = conclusion.view?.conclusion ?? null;

  React.useEffect(() => {
    if (!editing && current) {
      setSummary(current.summary);
      setDecisions(current.decisions.join('\n'));
      setQuestions(current.openQuestions.join('\n'));
    }
  }, [current, editing]);

  const generate = async () => {
    if (current) {
      const ok = await confirm({
        title: t('meeting.conclusion.regenerateTitle'),
        description: t('meeting.conclusion.regenerateHint'),
        confirmText: t('meeting.conclusion.regenerate'),
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await conclusion.generate();
      setEditing(false);
      toast.success(t('meeting.conclusion.generated'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'meeting.conclusion.generateFailed' }));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!summary.trim()) return;
    setBusy(true);
    try {
      await conclusion.updateConclusion({
        summary: summary.trim(),
        decisions: lines(decisions),
        openQuestions: lines(questions),
      });
      setEditing(false);
      toast.success(t('meeting.conclusion.saved'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'meeting.conclusion.saveFailed' }));
    } finally {
      setBusy(false);
    }
  };

  const exportMarkdown = async () => {
    setBusy(true);
    try {
      await conclusion.exportMarkdown(locale === 'en-US' ? 'en' : 'zh');
      toast.success(t('meeting.conclusion.exported'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'meeting.conclusion.exportFailed' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="flex max-h-[46vh] shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border bg-card p-3"
      data-testid="meeting-conclusion-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-teal-500" />
        <h3 className="text-sm font-semibold">{t('meeting.conclusion.title')}</h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {current && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {t('meeting.conclusion.edit')}
            </Button>
          )}
          {editing ? (
            <>
              <Button size="sm" onClick={() => void save()} disabled={busy || !summary.trim()}>
                {t('meeting.conclusion.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                {t('meeting.conclusion.cancel')}
              </Button>
            </>
          ) : (
            <Button size="sm" variant={current ? 'outline' : 'default'} onClick={() => void generate()} disabled={busy}>
              {current ? <RefreshCw className="mr-1 h-3.5 w-3.5" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              {busy
                ? t('meeting.conclusion.generating')
                : current
                  ? t('meeting.conclusion.regenerate')
                  : t('meeting.conclusion.generate')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => void exportMarkdown()} disabled={busy}>
            <Download className="mr-1 h-3.5 w-3.5" />
            {t('meeting.conclusion.export')}
          </Button>
        </div>
      </div>

      {conclusion.loading ? (
        <p className="text-sm text-muted-foreground">{t('meeting.conclusion.loading')}</p>
      ) : conclusion.error ? (
        <div className="flex items-center gap-2 text-sm">
          <span>{errorText(conclusion.error, t, { fallback: 'meeting.conclusion.loadFailed' })}</span>
          <Button size="sm" variant="outline" onClick={() => void conclusion.reload()}>
            {t('meeting.conclusion.retry')}
          </Button>
        </div>
      ) : !current ? (
        <p className="text-sm text-muted-foreground">{t('meeting.conclusion.empty')}</p>
      ) : editing ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">
            {t('meeting.conclusion.summary')}
            <textarea
              className="mt-1 min-h-20 w-full rounded border bg-background p-2 text-sm"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            {t('meeting.conclusion.decisions')}
            <textarea
              className="mt-1 min-h-16 w-full rounded border bg-background p-2 text-sm"
              value={decisions}
              placeholder={t('meeting.conclusion.noDecisions')}
              onChange={(event) => setDecisions(event.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            {t('meeting.conclusion.openQuestions')}
            <textarea
              className="mt-1 min-h-16 w-full rounded border bg-background p-2 text-sm"
              value={questions}
              placeholder={t('meeting.conclusion.noOpenQuestions')}
              onChange={(event) => setQuestions(event.target.value)}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap">{current.summary}</p>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('meeting.conclusion.decisions')}</p>
            {current.decisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('meeting.conclusion.noDecisions')}</p>
            ) : (
              <ul className="list-disc pl-5">
                {current.decisions.map((decision, index) => (
                  <li key={`${index}-${decision}`}>{decision}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {t('meeting.conclusion.openQuestions')}
            </p>
            {current.openQuestions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('meeting.conclusion.noOpenQuestions')}</p>
            ) : (
              <ul className="list-disc pl-5">
                {current.openQuestions.map((question, index) => (
                  <li key={`${index}-${question}`}>{question}</li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('meeting.conclusion.generatedAt', { time: intl.formatDateTime(current.generatedAt) })}
            {current.editedAt
              ? ` · ${t('meeting.conclusion.editedAt', { time: intl.formatDateTime(current.editedAt) })}`
              : ''}
          </p>
        </div>
      )}

      {!conclusion.loading && !conclusion.error && (
        <MeetingActionItems
          items={conclusion.view?.actionItems ?? []}
          members={members}
          onCreate={async (input) => {
            await conclusion.createItem(input);
          }}
          onUpdate={async (itemId, input) => {
            await conclusion.updateItem(itemId, input);
          }}
          onToReminder={async (itemId, assistantId) => {
            await conclusion.toReminder(itemId, assistantId, DEFAULT_SCHEDULE_TIMEZONE);
          }}
          onRunFlow={async (itemId, workflowId) => {
            await conclusion.runFlow(itemId, workflowId);
          }}
        />
      )}
    </section>
  );
}
