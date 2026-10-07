'use client';

import * as React from 'react';
import type { VoiceSettings, VoiceSettingsUpdateInput } from '@wbfm/shared';
import { getAvatarModel } from '@/features/avatar/avatar-models';

interface Props {
  settings: VoiceSettings;
  onPatch: (patch: VoiceSettingsUpdateInput) => Promise<void>;
}

/** 形象开关：开启后对话页右侧出现 Live2D 角色（资源懒加载，关闭零下载） */
export function AvatarSection({ settings, onPatch }: Props) {
  const model = getAvatarModel(settings.avatarModelId);
  // 本地态在离散事件内同步落 DOM（避免受控值经外部存储调度晚于点击校验造成抖动）；
  // 服务端值（含失败回滚）通过 effect 回同步
  const [checked, setChecked] = React.useState(settings.avatarEnabled);
  React.useEffect(() => setChecked(settings.avatarEnabled), [settings.avatarEnabled]);
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="voice-avatar-section">
      <p className="text-sm font-medium">Live2D 形象</p>
      <label
        htmlFor="avatar-enabled"
        className="flex cursor-pointer items-start justify-between gap-3"
      >
        <span>
          <span className="block text-sm font-medium">对话页显示虚拟形象</span>
          <span className="block text-xs text-muted-foreground">
            右侧出现 {model.label}；说话时口型随朗读张合、表情随回复标签切换
          </span>
        </span>
        <input
          id="avatar-enabled"
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          data-testid="avatar-enabled"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            void onPatch({ avatarEnabled: e.target.checked });
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        形象资源（约 3MB 贴图/模型 + Cubism 渲染库）仅在开启后按需加载，关闭时不下载、不初始化。
      </p>
    </div>
  );
}
