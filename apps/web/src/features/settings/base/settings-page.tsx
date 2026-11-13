'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared/types';
import { DEMO_PROVIDER_ID } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useProviders, useSettings } from '@/lib/hooks/provider';
import { PanelVisibilityGate } from '@/lib/ui/panel-visibility';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ProviderCard } from '../providers/provider-card';
import { ProviderFormDialog } from '../providers/provider-form-dialog';
import { DemoModePanel } from '../providers/demo-mode-panel';
import { DefaultsPanel } from '../providers/defaults-panel';
import { AppearancePanel } from '../appearance/appearance-panel';
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
import { AboutPanel } from '../storage/about-panel';
import { HelpCenterPanel } from '@/features/help-center';
import { VoicePreferencePanel } from '@/features/voice';
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

/**
 * 设置页分组（右侧 sticky 锚点导航）：
 * 主题外观 / 形象模型 / 动作库 / 语音与对话 / 情绪与关系 / 事件与提醒 /
 * 工具与权限 / 技能与智能体 / 数据与备份 / 帮助与关于。
 * 分组只影响导航与标题，面板本身仍由 PanelVisibilityGate 统一控制显隐。
 */
type SettingsSectionId =
  | 'appearance'
  | 'avatar'
  | 'motion'
  | 'voice'
  | 'emotion'
  | 'events'
  | 'tools'
  | 'agents'
  | 'data'
  | 'about';

interface SettingsSection {
  id: SettingsSectionId;
  labelKey: `settings.sections.${SettingsSectionId}`;
  panels: React.ReactNode[];
}

export function SettingsPage({ autoCreateCard = false }: { autoCreateCard?: boolean }) {
  const { t } = useI18n();
  const { data: providers, isLoading, isError, refetch } = useProviders();
  const { data: settings } = useSettings();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Provider | null>(null);
  // 水合门控：供应商查询态在 SSR 与客户端首帧不一致，直接据此切结构会水合失配（React #418/#422）。
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // v2.4 M1：内置 demo 供应商由「演示模式」开关管理，不在通用供应商列表中出现
  const visibleProviders = providers?.filter((provider) => provider.id !== DEMO_PROVIDER_ID);
  const demoEnabled = settings?.demoModeEnabled === true;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (provider: Provider) => {
    setEditing(provider);
    setDialogOpen(true);
  };

  const sections: SettingsSection[] = [
    {
      id: 'appearance',
      labelKey: 'settings.sections.appearance',
      panels: [<AppearancePanel key="appear" />],
    },
    {
      id: 'avatar',
      labelKey: 'settings.sections.avatar',
      panels: [<VrmImportSection key="vrm-import" />, <VrmAvatarList key="vrm-list" />],
    },
    {
      id: 'motion',
      labelKey: 'settings.sections.motion',
      panels: [<MotionImportSection key="motion-import" />, <MotionList key="motion-list" />],
    },
    {
      id: 'voice',
      labelKey: 'settings.sections.voice',
      panels: [<VoicePreferencePanel key="voice" />, <WorkSignalPanel key="work-signal" />],
    },
    {
      id: 'emotion',
      labelKey: 'settings.sections.emotion',
      panels: [
        <EmotionPanel key="emotion" />,
        <RelationshipPanel key="relationship" />,
        <RelationshipReportPanel key="report" />,
        <InteractionGraphPanel key="interaction-graph" />,
      ],
    },
    {
      id: 'events',
      labelKey: 'settings.sections.events',
      panels: [<EventPanel key="events" />, <ScriptSchedulePanel key="script-schedule" />, <ReminderPanel key="reminder" />],
    },
    {
      id: 'tools',
      labelKey: 'settings.sections.tools',
      panels: [
        <SearchSettingsPanel key="search" />,
        <McpPanel key="mcp" />,
        <PermissionPanel key="perm" />,
        <ToolBreakerPanel key="breaker" />,
        <ToolDebugPanel key="tool-debug" />,
        <CapabilityTrustSection key="capability-trust" />,
        <AgentGovernanceSection key="agent-governance" />,
        <BranchLimitsPanel key="branch-limits" />,
      ],
    },
    {
      id: 'agents',
      labelKey: 'settings.sections.agents',
      panels: [
        <SkillsPanel key="skills" />,
        <SubagentPanel key="subagent" />,
        <TuningPanel key="tuning" />,
      ],
    },
    {
      id: 'data',
      labelKey: 'settings.sections.data',
      panels: [
        <CharacterCardsPanel key="cards" autoCreate={autoCreateCard} />,
        <KnowledgeRetrievalPanel key="knowledge" />,
        <ModPackPanel key="modpack" />,
        <MemoryPanel key="memory" />,
        <BackupPanel key="backup" />,
        <ArtifactPackPanel key="artifact-pack" />,
        <StorageCleanupPanel key="storage-cleanup" />,
      ],
    },
    {
      id: 'about',
      labelKey: 'settings.sections.about',
      panels: [<HelpCenterPanel key="help" />, <AboutPanel key="about" />],
    },
  ];

  return (
    <PageShell
      header={
        <PageHeader
          title={t('settings.title')}
          description={t('settings.description')}
          actions={
            <Button type="button" onClick={openCreate}>
              {t('settings.addProvider')}
            </Button>
          }
        />
      }
    >
      <div className="mx-auto flex w-full max-w-6xl gap-8">
        {/* 左侧：设置主内容 */}
        <div className="min-w-0 flex-1 space-y-8">
          {/* 基础设置：演示模式开关 + 供应商 + 默认偏好（不进分组，始终置顶） */}
          <DemoModePanel />

          {mounted && isLoading && <Spinner />}
          {mounted && isError && (
            <ErrorState message={t('settings.loadError')} onRetry={() => void refetch()} />
          )}
          {mounted && !isLoading && !isError && visibleProviders && (
            <div className="space-y-4" data-testid="provider-list">
              {visibleProviders.length === 0 && !demoEnabled && (
                <EmptyState
                  title={t('settings.empty.title')}
                  description={t('settings.empty.description')}
                  action={
                    <Button type="button" onClick={openCreate}>
                      {t('settings.empty.action')}
                    </Button>
                  }
                />
              )}
              {visibleProviders.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} onEdit={openEdit} />
              ))}
            </div>
          )}

          <DefaultsPanel />

          {/* 4 大分组 */}
          {sections.map((section) => (
            <div key={section.id} data-testid={`settings-section-${section.id}`}>
              <div
                id={`setting-${section.id}`}
                className="scroll-mt-6 border-b pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {t(section.labelKey)}
              </div>
              <PanelVisibilityGate className="space-y-4 pt-4">{section.panels}</PanelVisibilityGate>
            </div>
          ))}

          <ProviderFormDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            provider={editing}
          />
        </div>

        {/* 右侧：sticky 分组导航（lg+ 可见） */}
        <nav
          aria-label={t('settings.title')}
          className="sticky top-0 hidden h-fit w-48 shrink-0 space-y-1 lg:block"
        >
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#setting-${section.id}`}
              className="block rounded px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {t(section.labelKey)}
            </a>
          ))}
        </nav>
      </div>
    </PageShell>
  );
}
