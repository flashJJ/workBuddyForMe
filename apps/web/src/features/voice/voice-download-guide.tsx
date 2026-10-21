'use client';

import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { apiGet } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useVoiceSettings } from './use-voice-settings';
import { useVoiceModelDownloads } from './settings/use-voice-model-downloads';
import { formatBytes } from './settings/voice-model-card';

const HF_MIRROR = 'https://hf-mirror.com';
const HF_OFFICIAL = 'https://huggingface.co';

/**
 * v2.4 M3（P0-3/T3）· 语音模型下载引导（入口级成本透明）。
 *
 * 展示：总体积（取自模型状态接口，不硬编码）+「约 X MB · 视网速而定」+ 分项就绪态 +
 * 镜像切换 + 落盘位置 + 进度/取消/重试。复用现有下载器与状态查询，不改下载语义。
 */
export function VoiceDownloadGuide() {
  const { t } = useI18n();
  const { settings, modelStatus, update } = useVoiceSettings();
  const downloads = useVoiceModelDownloads();
  const [dataDir, setDataDir] = React.useState('');

  React.useEffect(() => {
    void apiGet<{ dataDir: string }>('/api/system/info')
      .then((info) => setDataDir(info.dataDir))
      .catch(() => undefined);
  }, []);
  if (!settings || !modelStatus || !Array.isArray(modelStatus.ttsModels)) return null;

  const ttsModel = settings.ttsModel;
  const asrView = downloads.viewFor('asr');
  const ttsView = downloads.viewFor('tts', ttsModel);
  const ttsInfo = modelStatus.ttsModels.find((item) => item.model === ttsModel);

  const totalBytes =
    (modelStatus.asrTotalBytes || asrView.bytesTotal) + (ttsInfo?.totalBytes || ttsView.bytesTotal);
  const doneBytes = asrView.bytesDone + ttsView.bytesDone;
  const busy = asrView.active || ttsView.active || asrView.status === 'downloading' || ttsView.status === 'downloading';
  const error = asrView.error ?? ttsView.error;
  const ratio = totalBytes > 0 ? Math.min(1, doneBytes / totalBytes) : 0;
  const allReady = modelStatus.asrReady && (ttsInfo?.ready ?? false);

  const items = [
    { key: 'asr', label: t('voice.model.asr.name'), bytes: modelStatus.asrTotalBytes, ready: modelStatus.asrReady },
    {
      key: ttsModel,
      label: t(ttsModel === 'melo' ? 'voice.model.tts.melo.name' : 'voice.model.tts.kokoro.name'),
      bytes: ttsInfo?.totalBytes ?? 0,
      ready: ttsInfo?.ready ?? false,
    },
  ];

  const startAll = () => {
    downloads.start('asr');
    downloads.start('tts', ttsModel);
  };
  const cancelAll = () => {
    downloads.cancel('asr');
    downloads.cancel('tts', ttsModel);
  };

  return (
    <div className="space-y-2.5 rounded-md border p-3" data-testid="voice-download-guide">
      <p className="text-sm font-medium">{t('voice.quickStart.download.title')}</p>
      <p className="text-xs text-muted-foreground" data-testid="voice-quickstart-size">
        {t('voice.quickStart.download.costLine', { size: formatBytes(totalBytes) })}
      </p>

      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">{item.label}</span>
            <span className="shrink-0 text-muted-foreground">
              {t('voice.model.approxSize', { size: formatBytes(item.bytes) })} ·{' '}
              {item.ready ? t('voice.model.ready') : t('voice.model.missing')}
            </span>
          </li>
        ))}
      </ul>

      {busy && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
              data-testid="voice-quickstart-progress"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatBytes(doneBytes)} / {formatBytes(totalBytes)}
          </p>
        </div>
      )}

      {error && !busy && (
        <p className="break-all text-xs text-destructive" title={error}>
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="voice-quickstart-mirror">{t('voice.storage.mirrorLabel')}</Label>
        <SimpleSelect
          id="voice-quickstart-mirror"
          data-testid="voice-quickstart-mirror"
          value={settings.modelMirrorBase ?? HF_MIRROR}
          onValueChange={(v) => void update({ modelMirrorBase: v })}
        >
          <option value={HF_MIRROR}>{t('voice.storage.mirrorCn')}</option>
          <option value={HF_OFFICIAL}>{t('voice.storage.mirrorOfficial')}</option>
        </SimpleSelect>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="voice-quickstart-disk">
        {t('voice.quickStart.download.diskLine', {
          path: dataDir ? `${dataDir}\\models\\voice` : t('voice.storage.dirDefault'),
        })}
      </p>
      {/* T4：如实声明半双工边界，不假装全双工 */}
      <p className="rounded-md bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground" data-testid="voice-half-duplex-notice">
        {t('voice.quickStart.boundary')}
      </p>

      <div className="flex items-center justify-end gap-2">
        {allReady ? (
          <p className="text-xs text-success" data-testid="voice-quickstart-done">
            {t('voice.quickStart.download.done')}
          </p>
        ) : busy ? (
          <Button type="button" variant="outline" size="sm" onClick={cancelAll} data-testid="voice-quickstart-cancel">
            {t('voice.model.cancel')}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={startAll} data-testid="voice-quickstart-download">
            {error ? <Loader2 className="mr-1 h-3.5 w-3.5" /> : <Download className="mr-1 h-3.5 w-3.5" />}
            {error ? t('voice.model.retry') : t('voice.quickStart.download.action')}
          </Button>
        )}
      </div>
    </div>
  );
}
