'use client';

import * as React from 'react';
import { isVrmAvatarId, type StageCastMember, type StageSlot } from '@wbfm/shared/schemas';
import { MotionContentMenu, type MotionContentSelection } from '@/features/avatar';

/** 舞台内容包动效预览事件：菜单 → 对应槽位的 StageActor */
export const STAGE_PREVIEW_EVENT = 'wbfm:stage-preview';

export interface StagePreviewDetail extends MotionContentSelection {
  slot: StageSlot;
}

interface Props {
  cast: readonly StageCastMember[];
  focus: StageSlot | null;
}

/** v4.0：舞台的内容包动效选择入口（只列 VRM 角色） */
export function StageMotionMenu({ cast, focus }: Props) {
  const vrmCast = cast.filter((member) => isVrmAvatarId(member.avatarModelId));
  const [picked, setPicked] = React.useState<StageSlot | null>(null);
  const active =
    (picked && vrmCast.some((member) => member.slot === picked) ? picked : null) ??
    (focus && vrmCast.some((member) => member.slot === focus) ? focus : null) ??
    vrmCast[0]?.slot ??
    null;

  if (!active) return null;
  const apply = (selection: MotionContentSelection) => {
    const detail: StagePreviewDetail = { slot: active, ...selection };
    window.dispatchEvent(new CustomEvent(STAGE_PREVIEW_EVENT, { detail }));
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-3 z-40 w-56 rounded-xl border border-white/10 bg-black/55 p-1.5 text-white shadow-2xl backdrop-blur-md"
      data-testid="stage-motion-menu"
    >
      <MotionContentMenu
        targets={vrmCast.map((member) => ({ id: member.slot, label: member.displayName }))}
        target={active}
        onTargetChange={(id) => setPicked(id as StageSlot)}
        onApply={apply}
      />
    </div>
  );
}
