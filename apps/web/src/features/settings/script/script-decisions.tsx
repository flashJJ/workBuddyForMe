'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import {
  PET_SCRIPT_DECISION_LIMITS,
  type PetScriptDecisionReasonCode,
  type PetScriptDecisionRecord,
  type PetScriptDecisionView,
} from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';

const QUERY_KEY = ['pet-script-decisions'] as const;

const SOURCE_LABELS: Record<PetScriptDecisionRecord['source'], MessageKey> = {
  proactive: 'settings.script.decisions.sources.proactive',
  trigger: 'settings.script.decisions.sources.trigger',
  ambient: 'settings.script.decisions.sources.ambient',
};

const REASON_LABELS: Record<PetScriptDecisionReasonCode, MessageKey> = {
  'hour:late-night': 'settings.script.decisions.reasons.lateNight',
  'hour:work-hours': 'settings.script.decisions.reasons.workHours',
  'mood:calm': 'settings.script.decisions.reasons.moodCalm',
  'mood:lively': 'settings.script.decisions.reasons.moodLively',
  'level:partner': 'settings.script.decisions.reasons.levelPartner',
  'work:busy-short': 'settings.script.decisions.reasons.busyShort',
  'work:idle-companion': 'settings.script.decisions.reasons.idleCompanion',
  'idle:long': 'settings.script.decisions.reasons.idleLong',
  'fresh:unplayed': 'settings.script.decisions.reasons.unplayed',
  'dedupe:prop': 'settings.script.decisions.reasons.propRepeat',
  'dedupe:theme': 'settings.script.decisions.reasons.themeRepeat',
  'dedupe:tag': 'settings.script.decisions.reasons.tagRepeat',
  'pref:hour': 'settings.script.decisions.reasons.prefHour',
  'pref:mood': 'settings.script.decisions.reasons.prefMood',
  'cost:long-scene': 'settings.script.decisions.reasons.longScene',
};

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** M3 Utility：最近决策（只读；只展示实际开演的场次） */
export function ScriptDecisions() {
  const { t } = useI18n();
  const query = useVisibleQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiGet<PetScriptDecisionView>(
        `/api/pet/script/decisions?limit=${PET_SCRIPT_DECISION_LIMITS.visible}`,
      ),
    staleTime: 30_000,
  });
  const decisions = query.data?.decisions ?? [];

  return (
    <section className="space-y-2 border-t pt-3" data-testid="script-decisions">
      <div>
        <p className="text-sm font-medium">{t('settings.script.decisions.title')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('settings.script.decisions.hint')}
        </p>
      </div>
      {decisions.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="script-decisions-empty">
          {t('settings.script.decisions.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {decisions.map((record) => (
            <li
              key={`${record.at}-${record.sceneId}`}
              className="rounded-md border bg-muted/20 px-2.5 py-2 text-xs"
              data-testid="script-decision-item"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{record.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatTime(record.at)} · {t(SOURCE_LABELS[record.source])}
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {t('settings.script.decisions.score', { score: record.score.toFixed(2) })}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-muted-foreground">
                {record.reasons.map((reason) => (
                  <span
                    key={reason.code}
                    className="rounded-full bg-background px-1.5 py-0.5"
                  >
                    {t(REASON_LABELS[reason.code])}
                    {reason.delta > 0 ? '+' : ''}
                    {reason.delta.toFixed(2)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
