'use client';

import * as React from 'react';
import { audioDirector } from './director';
import { useAudioDirector } from './use-audio-director';

/** v4.3 M4：可枚举的音频输出设备 */
export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

/**
 * 设置页专用：枚举 audiooutput 并跟随 devicechange 刷新。
 * 桌宠/舞台启动路径不调用，避免无权限时的额外枚举与标签缺失。
 */
export function useAudioOutputDevices(): {
  devices: AudioOutputDevice[];
  selected: string | null;
  supported: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  select: (deviceId: string | null) => void;
} {
  const { outputDevice } = useAudioDirector();
  const [devices, setDevices] = React.useState<AudioOutputDevice[]>([]);
  const [supported, setSupported] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!media?.enumerateDevices) {
      setSupported(false);
      setDevices([]);
      return;
    }
    setSupported(true);
    setLoading(true);
    try {
      const list = await media.enumerateDevices();
      setDevices(
        list
          .filter((device) => device.kind === 'audiooutput')
          .map((device) => ({ deviceId: device.deviceId, label: device.label })),
      );
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const onChange = () => void refresh();
    media.addEventListener('devicechange', onChange);
    return () => media.removeEventListener('devicechange', onChange);
  }, [refresh]);

  const select = React.useCallback((deviceId: string | null) => {
    audioDirector.setOutputDevice(deviceId);
  }, []);

  return { devices, selected: outputDevice, supported, loading, refresh, select };
}
