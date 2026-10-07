'use client';

import * as React from 'react';
import type { VoiceSettings, VoiceSettingsUpdateInput } from '@wbfm/shared';
import { AVATAR_MODEL_LIST, getAvatarModel } from '@/features/avatar/avatar-models';
import { getPetBridge } from '@/features/pet/pet-bridge';
import { usePetOpenState } from '@/features/pet/use-pet-voice-relay';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface Props {
  settings: VoiceSettings;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}

/**
 * Live2D 形象：对话页右侧虚拟角色开关 + 内置模型选择（M3.5 起 5 套官方样本）。
 * M4 伴身：桌面端额外提供「桌宠模式」开关（透明置顶小窗，仅 Electron preload 有桥时出现）。
 */
export function AvatarSection({ settings, onPatch }: Props) {
  // 本地态在离散事件内同步落 DOM（避免外部存储驱动的受控 Select 二次操作回退），
  // 服务端值通过 effect 回同步
  const [enabled, setEnabled] = React.useState(settings.avatarEnabled);
  const [modelId, setModelId] = React.useState(settings.avatarModelId);
  React.useEffect(() => setEnabled(settings.avatarEnabled), [settings.avatarEnabled]);
  React.useEffect(() => setModelId(settings.avatarModelId), [settings.avatarModelId]);

  const model = getAvatarModel(modelId);
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
        void petBridge.open(model.id);
      } else {
        void onPatch({ petEnabled: false });
        void petBridge.close();
      }
    },
    [petBridge, onPatch, model.id],
  );

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="voice-avatar-section">
      <p className="text-sm font-medium">Live2D 形象</p>
      <label
        className="flex cursor-pointer items-start justify-between gap-3"
        data-testid="avatar-enabled-row"
      >
        <span>
          <span className="block text-sm font-medium">对话页显示虚拟形象</span>
          <span className="block text-xs text-muted-foreground">
            右侧出现 Live2D 角色；说话时口型随朗读张合、表情随回复切换
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
          <Label htmlFor="avatar-model">虚拟角色</Label>
          <Select
            id="avatar-model"
            data-testid="avatar-model"
            value={model.id}
            onChange={(e) => {
              const next = e.target.value;
              setModelId(next);
              void onPatch({ avatarModelId: next });
              // 桌宠正开着：原位切换桌宠模型（主进程 open 对不同模型做静默换窗），
              // 不必先关再勾选；桌宠未开时 open 不调用即无副作用
              if (petBridge && petOpen) void petBridge.open(next);
            }}
          >
            {AVATAR_MODEL_LIST.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            均为 Live2D 官方样本角色（免费素材许可，仅内置不可导入外部模型）；切换后即时生效
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        形象资源（约 0.7–4.8MB 贴图/模型 + Cubism 渲染库，gzip 约 157KB）仅在开启后按需加载，
        关闭时不下载、不初始化
      </p>

      {petBridge && (
        <div className="border-t pt-3">
          <label
            className="flex cursor-pointer items-start justify-between gap-3"
            data-testid="pet-enabled-row"
          >
            <span>
              <span className="block text-sm font-medium">桌宠模式（桌面端）</span>
              <span className="block text-xs text-muted-foreground">
                角色以透明置顶小窗陪在桌面：身体区拖动、双击回主窗、右键切换鼠标穿透；
                朗读时桌宠口型/字幕同步
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
            桌宠打开时主窗形象栏自动让位；关闭主窗口不会退出应用，双击桌宠可唤回
          </p>
        </div>
      )}
    </div>
  );
}
