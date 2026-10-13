/**
 * event-m5 English copy (DeepPartial of zh shape; see event-m5.ts).
 */
import type { DeepPartialMessages } from '../types';
import type { zhEventM5 } from './event-m5';

export const enEventM5: DeepPartialMessages<typeof zhEventM5> = {
  customTriggers: {
    title: 'Custom phrase triggers',
    description:
      'Play a scene when your message contains a phrase. Matching is local only — phrases never leave this device.',
    addAction: 'New rule',
    empty: 'No custom rules yet. Try adding a phrase like “well done”.',
    createTitle: 'New trigger rule',
    editTitle: 'Edit trigger rule',
    saving: 'Saving…',
    assistantLabel: 'Assistant',
    assistantPlaceholder: 'Choose the owning assistant',
    eventLabel: 'Scene',
    phrasesLabel: 'Trigger phrases (one per line)',
    phrasesPlaceholder: 'e.g.\ngreat job\nwell done',
    phrasesHint: 'Contains-match; up to 30 phrases, 24 chars each; duplicates removed.',
    tooManyPhrases: 'At most 30 phrases',
    cooldownLabel: 'Cooldown',
    maxPerDayLabel: 'Daily cap',
    windowLabel: 'Active hours',
    windowStart: 'Start hour',
    windowEnd: 'End hour',
    windowHour: ':00 (same = all day; overnight e.g. 22–6)',
    minIntimacyLabel: 'Min intimacy',
    enabledLabel: 'Enable this rule',
    unitMinute: 'min',
    unitHour: 'h',
    perDaySuffix: '/day',
    hourSuffix: ':00',
  },
  eventStats: {
    title: 'Interrupt stats (last 30 days)',
    selectAssistant: 'Select assistant',
    played: 'Played',
    acceptRate: 'Acceptance',
    interruptRate: 'Interrupt',
    noData: 'No scenes played in this period.',
    downgradeHint:
      'Interrupt rate is high — consider lowering the frequency tier above (settings are never changed automatically).',
  },
};
