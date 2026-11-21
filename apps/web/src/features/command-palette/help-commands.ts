import type { Command } from '@wbfm/shared/command';
import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';
import { openGlobalSearch } from '@/features/global-search';
import { openShortcutsOverlay } from '@/features/shortcuts';

/** v4.18：命令面板首组「快捷键与用法」，让能力不只存在于文档 */
export function createHelpCommands(input: {
  t: (key: MessageKey, vars?: MessageVars) => string;
  navigate: (href: string) => void;
  openSettings: (anchor: string) => void;
  notify: (message: string) => void;
}): Command[] {
  const { t, navigate, openSettings, notify } = input;
  const ck = 'commandPalette.commands';
  return [
    {
      id: 'help:shortcuts',
      label: t(`${ck}.shortcuts.label`),
      description: t(`${ck}.shortcuts.description`),
      group: 'help',
      keywords: ['shortcut', '快捷键', 'ctrl+/'],
      action: () => openShortcutsOverlay(),
    },
    {
      id: 'help:search',
      label: t(`${ck}.globalSearch.label`),
      description: t(`${ck}.globalSearch.description`),
      group: 'help',
      keywords: ['search', '检索', '搜索', 'ctrl+shift+f'],
      action: () => openGlobalSearch(),
    },
    {
      id: 'help:voice',
      label: t(`${ck}.usageVoice.label`),
      description: t(`${ck}.usageVoice.description`),
      group: 'help',
      keywords: ['voice', '语音', '朗读', 'tts'],
      action: () => openSettings('voice'),
    },
    {
      id: 'help:at',
      label: t(`${ck}.usageAt.label`),
      description: t(`${ck}.usageAt.description`),
      group: 'help',
      keywords: ['at', '@', '引用', 'mention'],
      action: () => {
        navigate('/chat');
        notify(t(`${ck}.usageAtHint`));
      },
    },
    {
      id: 'help:slash',
      label: t(`${ck}.usageSlash.label`),
      description: t(`${ck}.usageSlash.description`),
      group: 'help',
      keywords: ['slash', '/', '命令', 'command'],
      action: () => {
        navigate('/chat');
        notify(t(`${ck}.usageSlashHint`));
      },
    },
    {
      id: 'help:pet',
      label: t(`${ck}.usagePet.label`),
      description: t(`${ck}.usagePet.description`),
      group: 'help',
      keywords: ['pet', '桌宠', '伙伴'],
      action: () => openSettings('appearance'),
    },
  ];
}
