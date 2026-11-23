'use client';

import { FolderOpen, RefreshCw, Trash2, Webhook } from 'lucide-react';
import type { FlowTriggerView } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { formatTriggerTime } from './trigger-dialog-helpers';

export interface TriggerListProps {
  triggers: FlowTriggerView[];
  confirmRemoveId: string | null;
  rotateConfirmId: string | null;
  rotating: boolean;
  onToggle: (trigger: FlowTriggerView) => void;
  onRemove: (trigger: FlowTriggerView) => void;
  onRotate: (trigger: FlowTriggerView) => void;
}

/** v4.26 触发器列表；Webhook 行提供 Secret 轮换入口 */
export function TriggerList({
  triggers,
  confirmRemoveId,
  rotateConfirmId,
  rotating,
  onToggle,
  onRemove,
  onRotate,
}: TriggerListProps) {
  const { t } = useI18n();

  if (triggers.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">{t('flowEditor.trigger.empty')}</p>;
  }

  return (
    <div className="max-h-48 space-y-1 overflow-auto">
      {triggers.map((trigger) => (
        <div
          key={trigger.id}
          className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
        >
          {trigger.kind === 'webhook' ? (
            <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">{trigger.name}</span>
          <span className="text-[11px] text-muted-foreground">
            {trigger.lastFiredAt
              ? t('flowEditor.trigger.lastFired', {
                  time: formatTriggerTime(trigger.lastFiredAt),
                })
              : t('flowEditor.trigger.lastNever')}
          </span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={trigger.enabled} onChange={() => onToggle(trigger)} />
            {t('flowEditor.trigger.enabled')}
          </label>
          {trigger.kind === 'webhook' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => onRotate(trigger)}
              disabled={rotating}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {rotateConfirmId === trigger.id
                ? t('flowEditor.trigger.rotateConfirm')
                : t('flowEditor.trigger.rotate')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => onRemove(trigger)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmRemoveId === trigger.id
              ? t('flowEditor.trigger.removeConfirm')
              : t('flowEditor.trigger.remove')}
          </Button>
        </div>
      ))}
    </div>
  );
}
