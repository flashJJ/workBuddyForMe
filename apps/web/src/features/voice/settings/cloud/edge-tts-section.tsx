'use client';

import * as React from 'react';
import {
  EDGE_TTS_VOICES,
  type VoiceSettings,
  type VoiceSettingsUpdateInput,
} from '@wbfm/shared/schemas';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * 微软 Edge 在线朗读：免密钥，仅需联网。
 * 音色即时保存；已保存的其他音色 id 原样保留在选项中。
 */
export function EdgeTtsSection(props: {
  settings: VoiceSettings;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const { settings, onPatch } = props;
  const options = React.useMemo(() => {
    const list: Array<{ value: string; label: string }> = EDGE_TTS_VOICES.map((item) => ({
      ...item,
    }));
    if (!list.some((item) => item.value === settings.edgeVoice)) {
      list.push({ value: settings.edgeVoice, label: settings.edgeVoice });
    }
    return list;
  }, [settings.edgeVoice]);

  return (
    <div className="space-y-3 rounded-md border bg-ui-row p-3" data-testid="voice-edge-section">
      <div>
        <p className="text-sm font-medium">{t('voice.engine.edgeTitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('voice.engine.edgeHint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edge-voice">{t('voice.engine.edgeVoiceLabel')}</Label>
        <SimpleSelect
          id="edge-voice"
          value={settings.edgeVoice}
          onValueChange={(value) => void onPatch({ edgeVoice: value })}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SimpleSelect>
      </div>
      <p className="text-xs text-muted-foreground">{t('voice.engine.edgeNote')}</p>
    </div>
  );
}
