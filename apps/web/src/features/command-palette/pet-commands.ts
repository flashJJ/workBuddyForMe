'use client';

import type { Command } from '@wbfm/shared/command';
import type { MessageKey } from '@wbfm/shared/i18n';
import { getPetBridge } from '@/features/pet/bridge';

type Translate = (key: MessageKey) => string;

/** v4.17：桌宠开关命令（仅桌面端存在桥接时注入） */
export function createPetCommands(t: Translate): Command[] {
  if (!getPetBridge()) return [];
  return [
    {
      id: 'pet:open',
      label: t('commandPalette.commands.petOpen.label'),
      description: t('commandPalette.commands.petOpen.description'),
      group: 'navigation',
      keywords: ['pet', '桌宠', '伙伴', '形象'],
      action: () => void getPetBridge()?.open(),
    },
    {
      id: 'pet:close',
      label: t('commandPalette.commands.petClose.label'),
      description: t('commandPalette.commands.petClose.description'),
      group: 'navigation',
      keywords: ['pet', '桌宠', '关闭', '隐藏'],
      action: () => void getPetBridge()?.close(),
    },
  ];
}
