'use client';

import { useI18n } from '@/lib/i18n/use-i18n';
import { Button } from '@/components/ui/button';
import { useAudioOutputDevices } from '../use-audio-output-devices';

/** v4.3 M4：设置页音频输出设备面板 */
export function AudioOutputPanel() {
  const { t } = useI18n();
  const { devices, selected, supported, loading, refresh, select } = useAudioOutputDevices();
  const missing = !!selected && !devices.some((device) => device.deviceId === selected);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="audio-output-panel">
      <div>
        <h3 className="font-medium">{t('audio.output.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('audio.output.description')}</p>
      </div>

      {!supported ? (
        <p className="text-xs text-muted-foreground">{t('audio.output.unsupported')}</p>
      ) : (
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('audio.output.device')}</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              data-testid="audio-output-select"
              value={selected ?? ''}
              disabled={loading}
              onChange={(event) => select(event.target.value || null)}
            >
              <option value="">{t('audio.output.defaultDevice')}</option>
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `${t('audio.output.unknownDevice')} ${index + 1}`}
                </option>
              ))}
              {missing && <option value={selected ?? ''}>{t('audio.output.missing')}</option>}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void refresh()}
              data-testid="audio-output-refresh"
            >
              {loading ? t('audio.output.refreshing') : t('audio.output.refresh')}
            </Button>
            {loading && (
              <span className="text-xs text-muted-foreground">{t('audio.output.loading')}</span>
            )}
          </div>

          {missing && <p className="text-xs text-warning">{t('audio.output.missingHint')}</p>}
        </div>
      )}
    </section>
  );
}
