'use client';

import * as React from 'react';
import {
  EVENT_TRIGGER_PHRASES_MAX,
  type EventTriggerCreateInput,
  type EventTriggerView,
} from '@wbfm/shared/schemas';
import { BUILT_IN_EVENTS } from '@wbfm/shared/events';
import { Button } from '@/components/ui/button';
import { eventTitle } from './event-title';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NumberInput } from '@/components/ui/number-input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useEventTriggerMutations } from './use-event-triggers-data';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: EventTriggerView | null;
  defaultAssistantId?: string;
}

interface FormState {
  assistantId: string;
  eventId: string;
  /** 短语用换行编辑 */
  phrasesText: string;
  cooldownMinutes: number;
  startHour: number;
  endHour: number;
  maxPerDay: number;
  minIntimacy: number;
  enabled: boolean;
}

const COOLDOWN_OPTIONS = [5, 10, 30, 60, 180, 360, 720];

function toForm(trigger: EventTriggerView | null, defaultAssistantId: string): FormState {
  if (trigger) {
    return {
      assistantId: trigger.assistantId,
      eventId: trigger.eventId,
      phrasesText: trigger.phrases.join('\n'),
      cooldownMinutes: Math.round(trigger.cooldownMs / 60_000),
      startHour: trigger.startHour,
      endHour: trigger.endHour,
      maxPerDay: trigger.maxPerDay,
      minIntimacy: trigger.minIntimacy,
      enabled: trigger.enabled,
    };
  }
  return {
    assistantId: defaultAssistantId,
    eventId: BUILT_IN_EVENTS[0]?.id ?? '',
    phrasesText: '',
    cooldownMinutes: 30,
    startHour: 0,
    endHour: 23,
    maxPerDay: 3,
    minIntimacy: 0,
    enabled: true,
  };
}

export function CustomTriggerFormDialog({ open, onOpenChange, trigger, defaultAssistantId = '' }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const { data: assistantsRaw } = useAssistants();
  const assistants = Array.isArray(assistantsRaw) ? assistantsRaw : [];
  const mutations = useEventTriggerMutations();
  const [form, setForm] = React.useState<FormState>(() => toForm(trigger, defaultAssistantId));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(toForm(trigger, defaultAssistantId));
  }, [open, trigger, defaultAssistantId]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const phrases = form.phrasesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.assistantId || !form.eventId || phrases.length === 0) return;
    if (phrases.length > EVENT_TRIGGER_PHRASES_MAX) {
      toast.error(t('customTriggers.tooManyPhrases'));
      return;
    }
    setSubmitting(true);
    try {
      if (trigger) {
        await mutations.update.mutateAsync({
          id: trigger.id,
          patch: {
            eventId: form.eventId,
            phrases,
            cooldownMs: form.cooldownMinutes * 60_000,
            startHour: form.startHour,
            endHour: form.endHour,
            maxPerDay: form.maxPerDay,
            minIntimacy: form.minIntimacy,
            enabled: form.enabled,
          },
        });
      } else {
        const body: EventTriggerCreateInput = {
          assistantId: form.assistantId,
          eventId: form.eventId,
          phrases,
          cooldownMs: form.cooldownMinutes * 60_000,
          startHour: form.startHour,
          endHour: form.endHour,
          maxPerDay: form.maxPerDay,
          minIntimacy: form.minIntimacy,
          enabled: form.enabled,
        };
        await mutations.create.mutateAsync(body);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  const selectCls = 'rounded-md border bg-background px-2 py-1.5 text-sm';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {trigger ? t('customTriggers.editTitle') : t('customTriggers.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" data-testid="custom-trigger-form">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('customTriggers.assistantLabel')}</span>
            <SimpleSelect
              className={`w-full ${selectCls} disabled:opacity-60`}
              value={form.assistantId}
              disabled={Boolean(trigger)}
              data-testid="custom-trigger-assistant"
              onValueChange={(v) => update({ assistantId: v })}
            >
              <option value="" disabled>
                {t('customTriggers.assistantPlaceholder')}
              </option>
              {(assistants ?? []).map((assistant) => (
                <option key={assistant.id} value={assistant.id}>
                  {assistant.emoji ? `${assistant.emoji} ` : ''}
                  {assistant.name}
                </option>
              ))}
            </SimpleSelect>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('customTriggers.eventLabel')}</span>
            <SimpleSelect
              className={`w-full ${selectCls}`}
              value={form.eventId}
              data-testid="custom-trigger-event"
              onValueChange={(v) => update({ eventId: v })}
            >
              {BUILT_IN_EVENTS.map((def) => (
                <option key={def.id} value={def.id}>
                  {eventTitle(def, t)}
                </option>
              ))}
            </SimpleSelect>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('customTriggers.phrasesLabel')}</span>
            <textarea
              value={form.phrasesText}
              required
              rows={3}
              data-testid="custom-trigger-phrases"
              placeholder={t('customTriggers.phrasesPlaceholder')}
              onChange={(e) => update({ phrasesText: e.target.value })}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">{t('customTriggers.phrasesHint')}</p>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('customTriggers.cooldownLabel')}</span>
              <SimpleSelect
                className={`w-full ${selectCls}`}
                value={String(form.cooldownMinutes)}
                onValueChange={(v) => update({ cooldownMinutes: Number(v) })}
              >
                {COOLDOWN_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes < 60 ? `${minutes} ${t('customTriggers.unitMinute')}` : `${minutes / 60} ${t('customTriggers.unitHour')}`}
                  </option>
                ))}
              </SimpleSelect>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('customTriggers.maxPerDayLabel')}</span>
              <NumberInput
                min={1}
                max={50}
                value={form.maxPerDay}
                onValueChange={(v) => update({ maxPerDay: v })}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('customTriggers.windowLabel')}</span>
              <span className="flex items-center gap-1">
                <NumberInput
                  min={0}
                  max={23}
                  value={form.startHour}
                  aria-label={t('customTriggers.windowStart')}
                  onValueChange={(v) => update({ startHour: v })}
                />
                <span>-</span>
                <NumberInput
                  min={0}
                  max={23}
                  value={form.endHour}
                  aria-label={t('customTriggers.windowEnd')}
                  onValueChange={(v) => update({ endHour: v })}
                />
                <span className="text-xs text-muted-foreground">{t('customTriggers.windowHour')}</span>
              </span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('customTriggers.minIntimacyLabel')}</span>
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.minIntimacy}
                  aria-label={t('customTriggers.minIntimacyLabel')}
                  onChange={(e) => update({ minIntimacy: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-8 shrink-0 text-right tabular-nums">{form.minIntimacy}</span>
              </span>
            </label>
          </div>

          {trigger && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
              />
              {t('customTriggers.enabledLabel')}
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('customTriggers.saving') : t('common.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
