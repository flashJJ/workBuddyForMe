import type { MessageNode } from './types';
import { zhCommon } from './messages/common';
import { zhNav } from './messages/nav';
import { zhCommandPalette } from './messages/command-palette';
import { zhSettings } from './messages/settings';
import { zhSettingsProviders } from './messages/settings-providers';
import { zhSettingsMcp } from './messages/settings-mcp';
import { zhSettingsBackup } from './messages/settings-backup';
import { zhAbout } from './messages/about';
import { zhChat } from './messages/chat';
import { zhChatMessages } from './messages/chat-messages';
import { zhToast } from './messages/toast';
import { zhErrors } from './messages/errors';
import { zhAssistants } from './messages/assistants';
import { zhKnowledge } from './messages/knowledge';
import { zhMemory } from './messages/memory';
import { zhTasks } from './messages/tasks';
import { zhFlows } from './messages/flows';
import { zhShare } from './messages/share';

/**
 * 简体中文完整字典（i18n 结构唯一真源）。按 namespace 拆分到 messages/*，
 * 此处仅做组合；新增域时同步 en-US.ts 与 messages 索引。
 * 约定：跨模块复用文案固定落 common.*，业务文案落模块前缀；
 * 插值 {name}；复数 {count, plural, one {# 项} other {# 项}}（中文恒 other）。
 */
export const zhCN = {
  common: zhCommon,
  nav: zhNav,
  commandPalette: zhCommandPalette,
  settings: zhSettings,
  settingsProviders: zhSettingsProviders,
  settingsMcp: zhSettingsMcp,
  settingsBackup: zhSettingsBackup,
  about: zhAbout,
  chat: zhChat,
  chatMessages: zhChatMessages,
  toast: zhToast,
  errors: zhErrors,
  assistants: zhAssistants,
  knowledge: zhKnowledge,
  memory: zhMemory,
  tasks: zhTasks,
  flows: zhFlows,
  share: zhShare,
} satisfies MessageNode;

export type ZhDictionary = typeof zhCN;
