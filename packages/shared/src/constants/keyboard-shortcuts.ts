import type { MessageKey } from '../i18n';

/**
 * 快捷键浮层（v1.2 M5）唯一真源：
 * 全局/对话/语音/Flow 四组操作的「i18n 键 + 键位串」。
 * 浮层渲染与实际绑定必须以本表为准（快照测试防漂移）。
 * 键位串用人类可读写法（Ctrl / Shift / Enter…），非机器加速器格式。
 */

export interface ShortcutItem {
  labelKey: MessageKey;
  /** 主键位（如 'Ctrl + K'） */
  keys: string;
  /** 可选第二键位 */
  keysAlt?: string;
}

export interface ShortcutGroup {
  titleKey: MessageKey;
  items: ShortcutItem[];
}

export const KEYBOARD_SHORTCUTS: readonly ShortcutGroup[] = [
  {
    titleKey: 'shortcuts.groups.global',
    items: [
      { labelKey: 'shortcuts.items.commandPalette', keys: 'Ctrl + K' },
      { labelKey: 'shortcuts.items.shortcutsOverlay', keys: 'Ctrl + /' },
      { labelKey: 'shortcuts.items.emergencyStop', keys: 'Ctrl + Alt + Esc' },
    ],
  },
  {
    titleKey: 'shortcuts.groups.chat',
    items: [
      { labelKey: 'shortcuts.items.send', keys: 'Enter' },
      { labelKey: 'shortcuts.items.newline', keys: 'Shift + Enter' },
      { labelKey: 'shortcuts.items.skipToContent', keys: 'Tab' },
      { labelKey: 'shortcuts.items.closeDialog', keys: 'Esc' },
    ],
  },
  {
    titleKey: 'shortcuts.groups.commandPalette',
    items: [
      { labelKey: 'shortcuts.items.moveSelection', keys: '↑ / ↓' },
      { labelKey: 'shortcuts.items.runCommand', keys: 'Enter' },
      { labelKey: 'shortcuts.items.closePalette', keys: 'Esc' },
    ],
  },
];
