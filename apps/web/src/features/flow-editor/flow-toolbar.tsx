'use client';

import Link from 'next/link';
import { ArrowLeft, Globe, Play, Save, ShieldCheck } from 'lucide-react';
import type { FlowStatus, WorkflowView } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageKey } from '@wbfm/shared/i18n';

const STATUS_BADGE: Record<FlowStatus, { label: MessageKey; variant: 'outline' | 'success' | 'default' }> = {
  draft: { label: 'flowEditor.toolbar.status.draft', variant: 'outline' },
  published: { label: 'flowEditor.toolbar.status.published', variant: 'success' },
  disabled: { label: 'flowEditor.toolbar.status.disabled', variant: 'outline' },
};

interface FlowToolbarProps {
  workflow: WorkflowView;
  version: number;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  running: boolean;
  diagnosticCount: number | null;
  onSave: () => void;
  onValidate: () => void;
  onPublish: () => void;
  onServing: () => void;
  onRun: () => void;
}

export function FlowToolbar({
  workflow,
  version,
  dirty,
  saving,
  publishing,
  running,
  diagnosticCount,
  onSave,
  onValidate,
  onPublish,
  onServing,
  onRun,
}: FlowToolbarProps) {
  const { t } = useI18n();
  const badge = STATUS_BADGE[workflow.status];

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
      <Button asChild variant="ghost" size="icon" className="h-8 w-8" title={t('flowEditor.toolbar.backToList')}>
        <Link href="/flows">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{workflow.name}</span>
          <Badge variant={badge.variant}>{t(badge.label)}</Badge>
          <span className="text-[11px] text-muted-foreground">v{version}</span>
          {dirty && <span className="text-[11px] text-warning">{t('flowEditor.toolbar.unsaved')}</span>}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {diagnosticCount !== null && (
          <Button variant="ghost" size="sm" onClick={onValidate} title={t('flowEditor.toolbar.revalidate')}>
            {diagnosticCount === 0 ? (
              <span className="text-xs text-success">{t('flowEditor.toolbar.validatePassed')}</span>
            ) : (
              <span className="text-xs text-destructive">
                {t('flowEditor.toolbar.problemCount', { count: diagnosticCount })}
              </span>
            )}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onValidate}>
          {t('flowEditor.toolbar.validate')}
        </Button>
        <Button variant="outline" size="sm" onClick={onSave} disabled={saving || !dirty}>
          <Save className="h-3.5 w-3.5" />
          {t('flowEditor.toolbar.save')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onPublish}
          disabled={publishing || version === 0 || dirty}
          title={
            dirty
              ? t('flowEditor.toolbar.publishTitleDirty')
              : version === 0
                ? t('flowEditor.toolbar.publishTitleNew')
                : t('flowEditor.toolbar.publishTitle')
          }
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('flowEditor.toolbar.publish')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onServing}
          disabled={workflow.status !== 'published'}
          title={
            workflow.status === 'published'
              ? t('flowEditor.toolbar.servingTitle')
              : t('flowEditor.toolbar.servingTitleLocked')
          }
        >
          <Globe className="h-3.5 w-3.5" />
          {t('flowEditor.toolbar.serving')}
        </Button>
        <Button size="sm" onClick={onRun} disabled={running || version === 0 || dirty}>
          <Play className="h-3.5 w-3.5" />
          {t('flowEditor.toolbar.run')}
        </Button>
      </div>
    </header>
  );
}
