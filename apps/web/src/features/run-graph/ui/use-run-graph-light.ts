'use client';

import * as React from 'react';
import {
  createLightLayer,
  type LightEmitInput,
  type LightLayer,
} from '@/components/ui/light-layer';

export type RunGraphLightInput = Omit<LightEmitInput, 'duration' | 'seed'>;

/** v2.20 M3：面板存活期持有图层；卸载即销毁，不把每帧进度放进 React state。 */
export function useRunGraphLight(active: boolean) {
  const layerRef = React.useRef<LightLayer | null>(null);

  React.useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const layer = createLightLayer(document.body);
    layerRef.current = layer;
    return () => {
      layer.destroy();
      if (layerRef.current === layer) layerRef.current = null;
    };
  }, [active]);

  return React.useCallback((input: RunGraphLightInput) => {
    layerRef.current?.emit(input);
  }, []);
}
