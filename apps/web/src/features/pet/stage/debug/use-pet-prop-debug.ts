'use client';

import * as React from 'react';

const HAND_KEYS: Readonly<Record<string, string>> = {
  '1': 'teacup',
  '2': 'bowl',
  '3': 'book',
};

const STAGE_KEYS: Readonly<Record<string, string>> = {
  '4': 'table',
};

const HAND_IDS = ['teacup', 'bowl', 'book'] as const;
const STAGE_IDS = ['table'] as const;

interface PropDebugTarget {
  attachProp?(id: string, on?: boolean): Promise<boolean>;
  showProp?(id: string, on?: boolean): Promise<boolean>;
}

/**
 * dev 道具验证入口：桌宠窗聚焦时按 1/2/3 挂茶杯/碗/书，4 显示桌子，0 全部收起。
 * 生产构建不注册；正式触发走剧本 `prop` cue。
 */
export function usePetPropDebug(ref: { readonly current: unknown }): void {
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const controller = ref.current as PropDebugTarget | null;
      if (!controller?.attachProp) return;
      if (event.key === '0') {
        for (const id of HAND_IDS) void controller.attachProp(id, false);
        for (const id of STAGE_IDS) void controller.showProp?.(id, false);
        return;
      }
      const stageId = STAGE_KEYS[event.key];
      if (stageId) {
        void controller.showProp?.(stageId);
        return;
      }
      const id = HAND_KEYS[event.key];
      if (!id) return;
      for (const other of HAND_IDS) if (other !== id) void controller.attachProp(other, false);
      void controller.attachProp(id);
    };
    window.addEventListener('keydown', onKeyDown);
    console.info('[pet] 道具调试：1=茶杯 2=碗 3=书 4=桌子 0=收起');
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ref]);
}
