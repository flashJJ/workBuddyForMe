'use client';

import type { SearchCredentialStatus } from '@wbfm/shared/types';
import type { SearchKeyProvider } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  provider: SearchKeyProvider;
  status: SearchCredentialStatus | undefined;
  value: string;
  saving: boolean;
  clearing: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
}

/** v2.24：Brave / Tavily 的 API Key 输入与脱敏状态 */
export function SearchCredentialField({
  provider,
  status,
  value,
  saving,
  clearing,
  onChange,
  onClear,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t(
          provider === 'brave'
            ? 'settings.search.braveKey'
            : 'settings.search.tavilyKey',
        )}
        <Input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            status?.hasKey
              ? t('settings.search.keyConfigured', { masked: status.masked ?? '' })
              : t('settings.search.keyPlaceholder')
          }
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {status?.hasKey
            ? t('settings.search.keySaved', { masked: status.masked ?? '' })
            : t('settings.search.keyMissing')}
        </span>
        {status?.hasKey && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={clearing}
            onClick={onClear}
          >
            {clearing ? t('settings.search.clearing') : t('settings.search.clearKey')}
          </Button>
        )}
        {saving && <span>{t('settings.saving')}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">{t('settings.search.keyHint')}</p>
    </div>
  );
}
