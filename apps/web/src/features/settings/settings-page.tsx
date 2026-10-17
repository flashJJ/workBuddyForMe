'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useProviders } from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ProviderCard } from './provider-card';
import { ProviderFormDialog } from './provider-form-dialog';
import { DefaultsPanel } from './defaults-panel';
import { AppearancePanel } from './appearance-panel';
import { McpPanel } from './mcp-panel';
import { PermissionPanel } from './permission-panel';
import { ToolBreakerPanel } from './tool-breaker-panel';
import { ToolDebugPanel } from './tool-debug-panel';
import { SkillsPanel } from './skills-panel';
import { MemoryPanel } from '../memory/memory-panel';
import { BackupPanel } from './backup-panel';
import { AboutPanel } from './about-panel';
import { HelpCenterPanel } from '../help-center/help-center-panel';
import { VoicePreferencePanel } from '../voice/settings/voice-preference-panel';
import { KnowledgeRetrievalPanel } from './knowledge-retrieval-panel';
import { EmotionPanel } from './emotion-panel';
import { RelationshipPanel } from './relationship-panel';
import { EventPanel } from './event-panel';
import { ReminderPanel } from '../reminders/reminder-panel';
import { CharacterCardsPanel } from '../character-cards/character-cards-panel';
import { TuningPanel } from '../tuning/tuning-panel';
import { VrmImportSection } from './vrm-import-section';
import { VrmAvatarList } from './vrm-avatar-list';
import { MotionImportSection } from './motion-import-section';
import { MotionList } from './motion-list';
import { ModPackPanel } from './mod-pack-panel';
import { RelationshipReportPanel } from './relationship-report-panel';

/**
 * 设置页 4 大分组（右侧 sticky 锚点导航）：
 * - appearance 形象外观：命名主题、VRM 导入与列表
 * - dialog 对话互动：语音偏好、情绪内核、关系等级、剧情事件、提醒、关系报告
 * - tools 工具与权限：MCP 服务器、工具权限/熔断/调试、技能包、参数调优
 * - data 数据与备份：角色卡、知识检索、个性化包、记忆、备份、关于
 */
interface SettingsSection {
  id: 'appearance' | 'dialog' | 'tools' | 'data';
  labelKey: `settings.sections.${'appearance' | 'dialog' | 'tools' | 'data'}`;
  panels: React.ReactNode[];
}

export function SettingsPage() {
  const { t } = useI18n();
  const { data: providers, isLoading, isError, refetch } = useProviders();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Provider | null>(null);

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
      panels: [
        <AppearancePanel key="appear" />,
        <VrmImportSection key="vrm-import" />,
        <VrmAvatarList key="vrm-list" />,
        <MotionImportSection key="motion-import" />,
        <MotionList key="motion-list" />,
      ],
    },
    {
      id: 'dialog',
      labelKey: 'settings.sections.dialog',
      panels: [
        <VoicePreferencePanel key="voice" />,
        <EmotionPanel key="emotion" />,
        <RelationshipPanel key="relationship" />,
        <EventPanel key="events" />,
        <RelationshipReportPanel key="report" />,
        <ReminderPanel key="reminder" />,
      ],
    },
    {
      id: 'tools',
      labelKey: 'settings.sections.tools',
      panels: [
        <McpPanel key="mcp" />,
        <PermissionPanel key="perm" />,
        <ToolBreakerPanel key="breaker" />,
        <ToolDebugPanel key="tool-debug" />,
        <SkillsPanel key="skills" />,
        <TuningPanel key="tuning" />,
      ],
    },
    {
      id: 'data',
      labelKey: 'settings.sections.data',
      panels: [
        <CharacterCardsPanel key="cards" />,
        <KnowledgeRetrievalPanel key="knowledge" />,
        <ModPackPanel key="modpack" />,
        <MemoryPanel key="memory" />,
        <BackupPanel key="backup" />,
        <HelpCenterPanel key="help" />,
        <AboutPanel key="about" />,
      ],
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 p-6">
      {/* 左侧：设置主内容 */}
      <div className="min-w-0 flex-1 space-y-8">
        <PageHeader
          title={t('settings.title')}
          description={t('settings.description')}
          actions={
            <Button type="button" onClick={openCreate}>
              {t('settings.addProvider')}
            </Button>
          }
        />

        {/* 基础设置：供应商 + 默认偏好（不进分组，始终置顶） */}
        {isLoading && <Spinner />}
        {isError && (
          <ErrorState message={t('settings.loadError')} onRetry={() => void refetch()} />
        )}
        {!isLoading && !isError && providers && (
          <div className="space-y-4" data-testid="provider-list">
            {providers.length === 0 && (
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
            {providers.map((provider) => (
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
            <div className="space-y-4 pt-4">{section.panels}</div>
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
        className="sticky top-6 hidden h-fit w-48 shrink-0 space-y-1 lg:block"
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
  );
}
