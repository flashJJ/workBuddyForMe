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
import { enFlowEditor } from './messages/flow-editor-en';
import { enVoice } from './messages/voice-en';
import { enPet } from './messages/pet';
import { enAvatar } from './messages/avatar';
import { enFlowExecution } from './messages/flow-execution';
import { enRuns } from './messages/runs';
import { enToolDebug } from './messages/tool-debug';
import { enToolTrace } from './messages/tool-trace';
import { enAgents } from './messages/agents-en';
import { enAgentTrace } from './messages/agent-trace-en';
import { enEmotion } from './messages/emotion';
import { enEvent } from './messages/event-en';
import { enReminders } from './messages/reminder-en';
import { enEventM5 } from './messages/event-m5-en';
import { enCharacterCards } from './messages/character-cards';
import { enTemplates } from './messages/templates';
import { enTuning } from './messages/tuning';
import { enStage } from './messages/stage-en';
import { enMeeting } from './messages/meeting-en';
import { enRelationship } from './messages/relationship';
import { enModPack } from './messages/mod-pack';
import { enRelationshipReport } from './messages/relationship-report';
import { enSettingsGraph } from './messages/settings-graph';
import { enReports } from './messages/reports';
import { enApprovals } from './messages/approvals';
import { enPlans } from './messages/plans';

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
  settingsGraph: enSettingsGraph,
  about: enAbout,
  chat: enChat,
  chatMessages: enChatMessages,
  toast: enToast,
  errors: enErrors,
  assistants: enAssistants,
  characterCards: enCharacterCards,
  templates: enTemplates,
  tuning: enTuning,
  stage: enStage,
  meeting: enMeeting,
  knowledge: enKnowledge,
  memory: enMemory,
  tasks: enTasks,
  flows: enFlows,
  share: enShare,
  shortcuts: enShortcuts,
  onboarding: enOnboarding,
  help: enHelp,
  flowEditor: enFlowEditor,
  voice: enVoice,
  pet: enPet,
  avatar: enAvatar,
  flowExecution: enFlowExecution,
  runs: enRuns,
  toolDebug: enToolDebug,
  toolTrace: enToolTrace,
  agents: enAgents,
  agentTrace: enAgentTrace,
  emotion: enEmotion,
  event: enEvent,
  reminders: enReminders,
  customTriggers: enEventM5.customTriggers,
  eventStats: enEventM5.eventStats,
  relationship: enRelationship,
  modPack: enModPack,
  relationshipReport: enRelationshipReport,
  reports: enReports,
  approvals: enApprovals,
  plans: enPlans,
};

export type EnDictionary = typeof enUS;
