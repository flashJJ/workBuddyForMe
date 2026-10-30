'use client';

import * as React from 'react';
import type { CapabilityHealth, CapabilityView } from '@wbfm/shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  capability: CapabilityView;
  health?: CapabilityHealth;
  busy: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onUninstall: (id: string) => void;
  onUpgrade: (capability: CapabilityView) => void;
}

/** v2.12：能力包行（签名/健康徽章 + effect 详情 + 启停/升级/卸载） */
export function CapabilityRow({
  capability,
  health,
  busy,
  onToggle,
  onUninstall,
  onUpgrade,
}: Props) {
  const { t } = useI18n();
  const confirm = useConfirm();

  return (
    <li
      data-testid={`capability-${capability.id}`}
      className="space-y-2 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={capability.status === 'enabled' ? 'success' : 'outline'}>
          {capability.status === 'enabled'
            ? t('capabilities.statusEnabled')
            : t('capabilities.statusDisabled')}
        </Badge>
        <Badge variant="info">{t(`capabilities.kind.${capability.kind}`)}</Badge>
        <Badge
          variant={
            capability.signatureStatus === 'valid'
              ? 'success'
              : capability.signatureStatus === 'invalid' ||
                  capability.signatureStatus === 'malformed'
                ? 'danger'
                : capability.signatureStatus === 'untrusted'
                  ? 'warning'
                  : 'outline'
          }
          data-testid={`capability-signature-${capability.id}`}
        >
          {t(`capabilities.signatureStatus.${capability.signatureStatus ?? 'none'}`)}
        </Badge>
        {health && (
          <Badge
            variant={
              health.status === 'ok'
                ? 'success'
                : health.status === 'warning'
                  ? 'warning'
                  : 'danger'
            }
            data-testid={`capability-health-${capability.id}`}
          >
            {t(`capabilities.health.${health.status}`)}
          </Badge>
        )}
        <span className="text-sm font-medium">{capability.name}</span>
        <span
          className="text-xs text-muted-foreground"
          data-testid={`capability-version-${capability.id}`}
        >
          {capability.id} · v{capability.version}
        </span>
      </div>
      {capability.description && (
        <p className="text-xs text-muted-foreground">{capability.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span>{t('capabilities.permissions')}:</span>
        {capability.permissions.length === 0 ? (
          <span>{t('capabilities.noPermission')}</span>
        ) : (
          capability.permissions.map((permission) => (
            <Badge key={permission} variant="outline" className="px-1.5 py-0">
              {permission}
            </Badge>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="capability-effect">
        {t(`capabilities.effectKind.${capability.kind}`)}:{' '}
        {capability.effectRef ?? t('capabilities.noEffect')}
      </p>
      {capability.lastError && (
        <p className="text-xs text-destructive">
          {t('capabilities.lastError')}: {capability.lastError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={capability.status === 'enabled' ? 'outline' : 'default'}
          disabled={busy}
          onClick={() => onToggle(capability.id, capability.status !== 'enabled')}
        >
          {capability.status === 'enabled'
            ? t('capabilities.disable')
            : t('capabilities.enable')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid={`capability-upgrade-${capability.id}`}
          disabled={busy}
          onClick={() => onUpgrade(capability)}
        >
          {t('capabilities.upgrade.action')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            if (
              await confirm({
                title: `${t('capabilities.uninstall')}: ${capability.name}`,
                description: capability.id,
                danger: true,
              })
            ) {
              onUninstall(capability.id);
            }
          }}
        >
          {t('capabilities.uninstall')}
        </Button>
      </div>
    </li>
  );
}
