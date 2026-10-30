'use client';

import * as React from 'react';
import type {
  CapabilitySignaturePolicy,
  CapabilityTrustedKey,
} from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';

const INPUT = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const PEM = 'h-28 w-full rounded-md border bg-background p-2 font-mono text-xs';
const POLICY_KEY = {
  off: 'settings.capabilityTrust.policyOff',
  warn: 'settings.capabilityTrust.policyWarn',
  require: 'settings.capabilityTrust.policyRequire',
} as const;

/** v2.12：能力包签名策略与本地信任公钥（settings JSON，整组保存） */
export function CapabilityTrustSection() {
  const { t } = useI18n();
  const toast = useToast();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [policy, setPolicy] = React.useState<CapabilitySignaturePolicy>('warn');
  const [keys, setKeys] = React.useState<CapabilityTrustedKey[]>([]);
  const [keyId, setKeyId] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [pem, setPem] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!settings) return;
    setPolicy(settings.capabilitySignaturePolicy ?? 'warn');
    setKeys(settings.capabilityTrustedKeys ?? []);
  }, [settings]);

  const addKey = () => {
    if (!keyId.trim() || !label.trim() || !pem.trim()) {
      setError(t('settings.capabilityTrust.invalid'));
      return;
    }
    if (keys.length >= 20) {
      setError(t('settings.capabilityTrust.limit'));
      return;
    }
    if (keys.some((item) => item.id === keyId.trim())) {
      setError(t('settings.capabilityTrust.invalid'));
      return;
    }
    setKeys([
      ...keys,
      {
        id: keyId.trim(),
        label: label.trim(),
        publicKey: pem.trim(),
        createdAt: new Date().toISOString(),
      },
    ]);
    setKeyId('');
    setLabel('');
    setPem('');
    setError(null);
  };

  const save = async () => {
    try {
      await update.mutateAsync({
        capabilitySignaturePolicy: policy,
        capabilityTrustedKeys: keys,
      });
      setError(null);
      toast.success(t('settings.capabilityTrust.saved'));
    } catch {
      setError(t('settings.capabilityTrust.invalid'));
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4" data-testid="capability-trust-section">
      <div>
        <h2 className="text-sm font-medium">{t('settings.capabilityTrust.title')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.capabilityTrust.hint')}</p>
      </div>

      <div className="flex flex-wrap gap-1.5" data-testid="capability-trust-policy">
        {(['off', 'warn', 'require'] as const).map((item) => (
          <button
            key={item}
            type="button"
            data-testid={`capability-trust-policy-${item}`}
            aria-pressed={policy === item}
            onClick={() => setPolicy(item)}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              policy === item
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t(POLICY_KEY[item])}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.capabilityTrust.policyHint')}</p>

      {keys.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('settings.capabilityTrust.empty')}</p>
      ) : (
        <ul className="space-y-2" data-testid="capability-trust-keys">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2 text-xs"
            >
              <Badge variant="outline">{key.id}</Badge>
              <span className="font-medium">{key.label}</span>
              <span className="text-muted-foreground">{key.createdAt.slice(0, 10)}</span>
              <Button
                size="sm"
                variant="outline"
                data-testid={`capability-trust-remove-${key.id}`}
                onClick={() => setKeys(keys.filter((item) => item.id !== key.id))}
              >
                {t('settings.capabilityTrust.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={INPUT}
          data-testid="capability-trust-key-id"
          placeholder={t('settings.capabilityTrust.keyId')}
          value={keyId}
          onChange={(event) => setKeyId(event.target.value)}
        />
        <input
          className={INPUT}
          data-testid="capability-trust-label"
          placeholder={t('settings.capabilityTrust.label')}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <textarea
        className={PEM}
        data-testid="capability-trust-pem"
        placeholder={t('settings.capabilityTrust.pem')}
        value={pem}
        onChange={(event) => setPem(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" data-testid="capability-trust-add" onClick={addKey}>
          {t('settings.capabilityTrust.add')}
        </Button>
        <Button
          size="sm"
          data-testid="capability-trust-save"
          disabled={update.isPending}
          onClick={() => void save()}
        >
          {update.isPending
            ? t('settings.capabilityTrust.saving')
            : t('settings.capabilityTrust.save')}
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </section>
  );
}
