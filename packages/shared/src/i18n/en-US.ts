import type { DeepPartialMessages } from './types';
import type { ZhDictionary } from './zh-CN';
import { enCommon } from './messages/common';
import { enNav } from './messages/nav';
import { enCommandPalette } from './messages/command-palette';
import { enSettings } from './messages/settings';
import { enSettingsProviders } from './messages/settings-providers';
import { enSettingsMcp } from './messages/settings-mcp';
import { enSettingsBackup } from './messages/settings-backup';
import { enAbout } from './messages/about';
import { enChat } from './messages/chat';
import { enChatMessages } from './messages/chat-messages';
import { enToast } from './messages/toast';
import { enErrors } from './messages/errors';
import { enAssistants } from './messages/assistants';
import { enKnowledge } from './messages/knowledge';
import { enMemory } from './messages/memory';
import { enTasks } from './messages/tasks';
import { enFlows } from './messages/flows';
import { enShare } from './messages/share';
import { enShortcuts } from './messages/shortcuts';
import { enOnboarding } from './messages/onboarding';
import { enHelp } from './messages/help';

/**
 * English dictionary (DeepPartial of zh-CN structure).
 * P0 paths must be complete; missing keys mechanically fall back to zh-CN.
 * 各片段按对应 zh 片段类型约束（DeepPartial），组合后整体仍受 ZhDictionary 校验。
 */
export const enUS: DeepPartialMessages<ZhDictionary> = {
  common: enCommon,
  nav: enNav,
  commandPalette: enCommandPalette,
  settings: enSettings,
  settingsProviders: enSettingsProviders,
  settingsMcp: enSettingsMcp,
  settingsBackup: enSettingsBackup,
  about: enAbout,
  chat: enChat,
  chatMessages: enChatMessages,
  toast: enToast,
  errors: enErrors,
  assistants: enAssistants,
  knowledge: enKnowledge,
  memory: enMemory,
  tasks: enTasks,
  flows: enFlows,
  share: enShare,
  shortcuts: enShortcuts,
  onboarding: enOnboarding,
  help: enHelp,
};

export type EnDictionary = typeof enUS;
