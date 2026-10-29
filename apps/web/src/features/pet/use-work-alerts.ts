'use client';

import * as React from 'react';
import type { AppSettings } from '@wbfm/shared/types';
import type { WorkSignalSnapshot } from '@wbfm/shared';
import { isFailureOutcome } from '@wbfm/shared';
import { playWorkSound } from './work-sounds';
import { useI18n } from '@/lib/i18n/use-i18n';

function inQuietHours(settings: AppSettings | undefined): boolean {
  if (settings?.doNotDisturbEnabled === false) return false;
  const start = settings?.doNotDisturbStartHour ?? 23;
  const end = settings?.doNotDisturbEndHour ?? 6;
  const hour = new Date().getHours();
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

function notify(title: string, body: string): void {
  void window.wbfm?.notify?.show({ title, body }).catch(() => undefined);
}

/**
 * v2.7 工作提示音/系统通知：
 * - 新审批：提示音 + 系统通知；
 * - 新失败：错误音 + 系统通知；
 * - 新完成：完成音（不弹通知，避免吵）；
 * - 首次快照只建立基线，不为历史终态补发提醒。
 */
export function useWorkAlerts(
  snapshot: WorkSignalSnapshot | null,
  settings: AppSettings | undefined,
): void {
  const { t } = useI18n();
  const seenRef = React.useRef<Set<string>>(new Set());
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (!snapshot) return;
    const keys = new Set<string>();
    for (const approval of snapshot.approvals) keys.add(`a:${approval.id}`);
    for (const signal of snapshot.signals) {
      if (signal.endedAt) keys.add(`t:${signal.key}:${signal.endedAt}`);
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      seenRef.current = keys;
      return;
    }

    const quiet = inQuietHours(settings);
    const freshApprovals = snapshot.approvals.filter(
      (approval) => !seenRef.current.has(`a:${approval.id}`),
    );
    const freshTerminals = snapshot.signals.filter(
      (signal) =>
        signal.endedAt && !seenRef.current.has(`t:${signal.key}:${signal.endedAt}`),
    );

    if (freshApprovals.length > 0) {
      if (!quiet && settings?.workSoundApproval !== false) playWorkSound('approval');
      if (!quiet) {
        notify(
          t('pet.work.notifyApprovalTitle'),
          freshApprovals.map((item) => item.title).join('；').slice(0, 200),
        );
      }
    }
    if (freshTerminals.length > 0 && !quiet) {
      const failure = freshTerminals.find((signal) => isFailureOutcome(signal.outcome));
      const success = freshTerminals.find((signal) => signal.outcome === 'succeeded');
      if (failure) {
        if (settings?.workSoundError !== false) playWorkSound('error');
        notify(t('pet.work.notifyFailureTitle'), (failure.errorReason ?? failure.title).slice(0, 200));
      } else if (success && settings?.workSoundDone !== false) {
        playWorkSound('success');
      }
    }

    seenRef.current = keys;
  }, [snapshot, settings, t]);
}
