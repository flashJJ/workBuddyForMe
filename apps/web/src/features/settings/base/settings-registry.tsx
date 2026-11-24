'use client';

import * as React from 'react';
import {
  SETTINGS_PANELS,
  type SettingsPanel,
  type SettingsPanelId,
} from '@/lib/settings/catalog';
import { DemoModePanel } from '../providers/demo-mode-panel';
import { DefaultsPanel } from '../providers/defaults-panel';
import { AppearancePanel } from '../appearance/appearance-panel';
import { BackgroundSettingsPanel } from '../appearance/background-settings-panel';
import { McpPanel } from '../mcp/mcp-panel';
import { PermissionPanel } from '../tools/permission-panel';
import { ToolBreakerPanel } from '../tools/tool-breaker-panel';
import { ToolDebugPanel } from '../tools/tool-debug-panel';
import { SearchSettingsPanel } from '../tools/search-settings-panel';
import { SkillsPanel } from '../skills/skills-panel';
import { MemoryPanel } from '@/features/memory';
import { BackupPanel } from '../storage/backup';
import { ArtifactPackPanel } from '../storage/artifact-pack-panel';
import { StorageCleanupPanel } from '../storage/storage-cleanup-panel';
import { WorkspaceRootsPanel } from '../storage/workspace-roots';
import { AboutPanel } from '../storage/about-panel';
import { HelpCenterPanel } from '@/features/help-center';
import { VoicePreferencePanel } from '@/features/voice';
import { MusicLibraryPanel } from '@/features/music';
import { AudioOutputPanel } from '@/features/audio';
import { KnowledgeRetrievalPanel } from '../storage/knowledge-retrieval-panel';
import { EmotionPanel } from '../dialog/emotion-panel';
import { InteractionGraphPanel } from '../dialog/interaction-graph-panel';
import { RelationshipPanel } from '../dialog/relationship-panel';
import { EventPanel } from '../events/event-panel';
import { ScriptSchedulePanel } from '../script/script-schedule-panel';
import { ReminderPanel } from '@/features/reminders';
import { CharacterCardsPanel } from '@/features/character-cards';
import { TuningPanel } from '@/features/tuning';
import { VrmImportSection } from '../appearance/vrm-import-section';
import { VrmAvatarList } from '../appearance/vrm-avatar-list';
import { MotionImportSection } from '../appearance/motion-import-section';
import { MotionList } from '../appearance/motion-list';
import { ModPackPanel } from '../storage/mod-pack-panel';
import { RelationshipReportPanel } from '../dialog/relationship-report-panel';
import { WorkSignalPanel } from '../dialog/work-signal-panel';
import { SubagentPanel } from '../subagent/subagent-panel';
import { CapabilityTrustSection } from '../tools/capability-trust-section';
import { AgentGovernanceSection } from '../tools/agent-governance-section';
import { BranchLimitsPanel } from '../branch/limits-panel';

interface PanelRenderOptions {
  autoCreateCard: boolean;
  /** 供应商列表节点由页面注入（依赖页面级查询与弹窗状态） */
  providers: React.ReactNode;
}

type PanelRenderer = (options: PanelRenderOptions) => React.ReactNode;

const PANEL_RENDERERS: Record<SettingsPanelId, PanelRenderer> = {
  'demo-mode': () => <DemoModePanel />,
  providers: ({ providers }) => providers,
  defaults: () => <DefaultsPanel />,
  appearance: () => <AppearancePanel />,
  background: () => <BackgroundSettingsPanel />,
  'avatar-import': () => <VrmImportSection />,
  'avatar-list': () => <VrmAvatarList />,
  'motion-import': () => <MotionImportSection />,
  'motion-list': () => <MotionList />,
  'voice-preference': () => <VoicePreferencePanel />,
  'audio-output': () => <AudioOutputPanel />,
  'music-library': () => <MusicLibraryPanel />,
  'work-signal': () => <WorkSignalPanel />,
  emotion: () => <EmotionPanel />,
  relationship: () => <RelationshipPanel />,
  'relationship-report': () => <RelationshipReportPanel />,
  'interaction-graph': () => <InteractionGraphPanel />,
  events: () => <EventPanel />,
  'script-schedule': () => <ScriptSchedulePanel />,
  reminder: () => <ReminderPanel />,
  'search-settings': () => <SearchSettingsPanel />,
  mcp: () => <McpPanel />,
  permissions: () => <PermissionPanel />,
  'tool-breaker': () => <ToolBreakerPanel />,
  'tool-debug': () => <ToolDebugPanel />,
  'capability-trust': () => <CapabilityTrustSection />,
  'agent-governance': () => <AgentGovernanceSection />,
  'branch-limits': () => <BranchLimitsPanel />,
  skills: () => <SkillsPanel />,
  subagent: () => <SubagentPanel />,
  tuning: () => <TuningPanel />,
  'character-cards': ({ autoCreateCard }) => <CharacterCardsPanel autoCreate={autoCreateCard} />,
  'knowledge-retrieval': () => <KnowledgeRetrievalPanel />,
  'mod-pack': () => <ModPackPanel />,
  memory: () => <MemoryPanel />,
  'workspace-roots': () => <WorkspaceRootsPanel />,
  backup: () => <BackupPanel />,
  'artifact-pack': () => <ArtifactPackPanel />,
  'storage-cleanup': () => <StorageCleanupPanel />,
  'help-center': () => <HelpCenterPanel />,
  about: () => <AboutPanel />,
};

export interface SettingsPanelEntry {
  meta: SettingsPanel;
  node: React.ReactNode;
}

export function createSettingsPanelEntries(options: PanelRenderOptions): SettingsPanelEntry[] {
  return SETTINGS_PANELS.map((meta) => ({ meta, node: PANEL_RENDERERS[meta.id](options) }));
}
