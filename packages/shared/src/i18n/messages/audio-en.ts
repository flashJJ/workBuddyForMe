/** audio 命名空间英文文案（键结构须与 audio.ts 的 zhAudio 严格一致） */
export const enAudio = {
  output: {
    title: 'Audio output',
    description:
      'Choose the system audio output. If switching fails or the device disappears, playback falls back to the default device.',
    device: 'Output device',
    defaultDevice: 'System default',
    unknownDevice: 'Unnamed device',
    refresh: 'Refresh devices',
    refreshing: 'Refreshing…',
    loading: 'Reading devices…',
    unsupported:
      'This environment cannot enumerate audio output devices; the system default will be used.',
    missing: 'Selected device is disconnected',
    missingHint:
      'The saved device is currently unavailable. Playback falls back to the system default, and you can select it again after reconnecting.',
  },
};
