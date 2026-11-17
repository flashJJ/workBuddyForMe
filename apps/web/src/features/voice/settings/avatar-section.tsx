'use client';

import * as React from 'react';
import {
  parseVrmAvatarId,
  resolveAvatarVoice,
  type VoiceSettings,
  type VoiceSettingsUpdateInput,
} from '@wbfm/shared/schemas';
import { BUILTIN_VRM_MODELS } from '@wbfm/shared/constants';
import type { MessageKey } from '@wbfm/shared/i18n';
import { AVATAR_MODEL_LIST } from '@/features/avatar';
import { getPetBridge } from '@/features/pet/bridge';
import { usePetOpenState } from '@/features/pet/bridge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { apiGet } from '@/lib/api/client';
import type { VrmAvatarListResponse } from '@wbfm/shared/schemas';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import { AvatarVoicePreview } from './avatar-voice-preview';

interface Props {
  settings: VoiceSettings;
  ttsReady: boolean;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}

/** 内置 VRM 的展示名（常量层不依赖 i18n，标签在渲染处解析） */
const BUILTIN_VRM_LABELS: Readonly<Record<string, MessageKey>> = {
  'builtin:xuetuan': 'avatar.vrm.builtinXuetuan',
  'builtin:rankaluli': 'avatar.vrm.builtinRankaluli',
  'builtin:feibi': 'avatar.vrm.builtinFeibi',
};

/**
 * Live2D 形象：对话页右侧虚拟角色开关 + 内置模型选择（M3.5 起 5 套官方样本）。
 * M4 伴身：桌面端额外提供「桌宠模式」开关（透明置顶小窗，仅 Electron preload 有桥时出现）。
 * M4.5：每个角色绑定固定 Kokoro 声线，可就地试听。
 */
export function AvatarSection({ settings, ttsReady, onPatch }: Props) {
  const { t } = useI18n();
  // 本地态在离散事件内同步落 DOM（避免外部存储驱动的受控 Select 二次操作回退），
  // 服务端值通过 effect 回同步
  const [enabled, setEnabled] = React.useState(settings.avatarEnabled);
  const [modelId, setModelId] = React.useState(settings.avatarModelId);
  React.useEffect(() => setEnabled(settings.avatarEnabled), [settings.avatarEnabled]);
  React.useEffect(() => setModelId(settings.avatarModelId), [settings.avatarModelId]);

  const { data: vrmData } = useVisibleQuery({
    queryKey: ['vrm-avatars'],
    queryFn: () => apiGet<VrmAvatarListResponse>('/api/vrm-avatars'),
  });
  const vrmAvatars = vrmData?.avatars ?? [];

  // 统一解析：内置 VRM / Live2D / 导入 VRM 回落都由同一函数决定，
  // 避免这里用 Live2D 注册表反查导致任何 VRM 都显示成 Haru。
  const fileRef = parseVrmAvatarId(modelId);
  const imported = fileRef ? vrmAvatars.find((item) => item.fileRef === fileRef) : undefined;
  const voice = resolveAvatarVoice(modelId, { speakerSid: imported?.voiceSid ?? null });
  const petBridge = React.useMemo(() => getPetBridge(), []);
  const petOpen = usePetOpenState();

  // 桌宠开关：本地态 + PUT 持久化 + 主进程开窗/关窗；
  // 桌宠自身右键「隐藏」会广播 open=false（onOpenChange），同步回本地态并落库
  React.useEffect(() => {
    if (!petBridge) return;
    const off = petBridge.onOpenChange((open) => {
      if (!open) void onPatch({ petEnabled: false });
    });
    return off;
  }, [petBridge, onPatch]);

  const togglePet = React.useCallback(
    (next: boolean) => {
      if (!petBridge) return;
      if (next) {
        void onPatch({ petEnabled: true });
        // 注意：传原始 modelId（settings.avatarModelId），**不**走 getAvatarModel 查表——
        // v2.0 VRM 模型 id 是 `vrm:{fileRef}` 动态值，不在硬编码 AVATAR_MODELS 白名单里，
        // 查表会回落 haru。主进程 PetManager.open() 需要的就是原始 avatarModelId。
        void petBridge.open(modelId || undefined);
      } else {
        void onPatch({ petEnabled: false });
        void petBridge.close();
      }
    },
    [petBridge, onPatch, modelId],
  );

  return (
    <div className="space-y-3 rounded-md border bg-ui-row p-3" data-testid="voice-avatar-section">
      <p className="text-sm font-medium">{t('voice.avatar.title')}</p>
      <label
        className="flex cursor-pointer items-start justify-between gap-3"
        data-testid="avatar-enabled-row"
      >
        <span>
          <span className="block text-sm font-medium">{t('voice.avatar.chatToggleLabel')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('voice.avatar.chatToggleHint')}
          </span>
        </span>
        <input
          id="avatar-enabled"
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          data-testid="avatar-enabled"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            void onPatch({ avatarEnabled: e.target.checked });
          }}
        />
      </label>

      {enabled && (
        <div className="space-y-1.5" data-testid="avatar-model-row">
          <Label htmlFor="avatar-model">{t('voice.avatar.modelLabel')}</Label>
          <SimpleSelect
            id="avatar-model"
            data-testid="avatar-model"
            value={modelId}
            onValueChange={(next) => {
              setModelId(next);
              void onPatch({ avatarModelId: next });
              // 桌宠正开着：原位切换桌宠模型（主进程 open 对不同模型做静默换窗），
              // petEnabled 兜底 isOpen 广播延迟/缺失，避免必须关掉再勾选才生效
              if (petBridge && (petOpen || settings.petEnabled)) void petBridge.open(next);
            }}
          >
            <optgroup label={t('avatar.vrm.builtinSectionTitle')}>
              {BUILTIN_VRM_MODELS.map((model) => (
                <option key={model.modelId} value={model.modelId}>
                  {t(BUILTIN_VRM_LABELS[model.fileRef] ?? 'avatar.vrm.builtinXuetuan')}
                </option>
              ))}
            </optgroup>
            {vrmAvatars.length > 0 && (
              <optgroup label={t('avatar.vrm.sectionTitle')}>
                {vrmAvatars.map((item) => (
                  <option key={item.id} value={`vrm:${item.fileRef}`}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={t('avatar.rail.title')}>
              {AVATAR_MODEL_LIST.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.label)}
                </option>
              ))}
            </optgroup>
          </SimpleSelect>
          <div
            className="flex items-center justify-between gap-2"
            data-testid="avatar-voice-row"
          >
            {settings.ttsModel === 'melo' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('voice.avatar.meloNote')}
                </p>
                <AvatarVoicePreview sid={0} ready={ttsReady} />
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('voice.avatar.voiceBinding', {
                    voice:
                      voice.voice === 'custom'
                        ? t('voice.avatar.customVoice')
                        : voice.voice,
                    gender: voice.gender === 'female' ? t('voice.avatar.femaleVoice') : t('voice.avatar.maleVoice'),
                    sid: voice.sid,
                  })}
                </p>
                <AvatarVoicePreview sid={voice.sid} ready={ttsReady} />
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('voice.avatar.modelsNote')}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('voice.avatar.resourceNote')}
      </p>

      {/* v3.0 P4：Q 版比例（仅 VRM；主窗与桌宠共用同一设置） */}
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-medium">{t('voice.avatar.chibiLabel')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('voice.avatar.chibiHint')}
          </span>
        </span>
        <input
          id="avatar-chibi"
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          data-testid="avatar-chibi"
          checked={settings.avatarChibi === true}
          onChange={(e) => void onPatch({ avatarChibi: e.target.checked })}
        />
      </label>

      {petBridge && (
        <div className="border-t pt-3">
          <label
            className="flex cursor-pointer items-start justify-between gap-3"
            data-testid="pet-enabled-row"
          >
            <span>
              <span className="block text-sm font-medium">{t('voice.avatar.petModeLabel')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('voice.avatar.petModeHint')}
              </span>
            </span>
            <input
              id="pet-enabled"
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0"
              data-testid="pet-enabled"
              checked={petOpen}
              onChange={(e) => togglePet(e.target.checked)}
            />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('voice.avatar.petModeNote')}
          </p>
          <div className="mt-3 space-y-1.5" data-testid="pet-size-row">
            <Label htmlFor="pet-size">{t('voice.avatar.petSizeLabel')}</Label>
            <SimpleSelect
              id="pet-size"
              data-testid="pet-size"
              value={settings.petSize ?? 'md'}
              onValueChange={(next) => void onPatch({ petSize: next as 'sm' | 'md' | 'lg' })}
            >
              <option value="sm">{t('voice.avatar.petSizeSm')}</option>
              <option value="md">{t('voice.avatar.petSizeMd')}</option>
              <option value="lg">{t('voice.avatar.petSizeLg')}</option>
            </SimpleSelect>
            <p className="text-xs text-muted-foreground">{t('voice.avatar.petSizeHint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
