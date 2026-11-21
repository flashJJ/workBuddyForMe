'use client';

import * as React from 'react';
import { PET_FRAME_PADDING, useBackground } from '@/features/background';
import type { WbfmPetBridge } from '@wbfm/shared/pet';
import { petBackgroundHitRect, reportPetUiRect } from '../hit-proxy';

/**
 * B-65：桌宠有背景时整张画框都是可见区域，需整体并入命中区。
 * 否则点在角色上方的背景空白处会被当成透明区，点击穿透到桌面。
 */
export function usePetBackgroundHit(bridge: WbfmPetBridge | null): void {
  const view = useBackground('pet');
  const framed = view.resolved.kind !== 'none';

  React.useEffect(() => {
    if (!framed) return;
    const report = () =>
      reportPetUiRect(
        'pet-background',
        petBackgroundHitRect(
          { width: window.innerWidth, height: window.innerHeight },
          PET_FRAME_PADDING,
        ),
        bridge,
      );
    report();
    window.addEventListener('resize', report);
    return () => {
      window.removeEventListener('resize', report);
      reportPetUiRect('pet-background', null, bridge);
    };
  }, [framed, bridge]);
}
