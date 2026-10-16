'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { RelationshipLevelView } from './relationship-level-view';

/**
 * v2.0 关系等级面板：
 * 独立开关（即时保存+乐观翻转）+ 助手选择；当前等级/解锁清单/规则说明
 * 在 RelationshipLevelView（拆分守行数门禁）。
 */
export function RelationshipPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: assistants } = useAssistants();
  const [selectedId, setSelectedId] = React.useState<string>('');
  // 水合门控：与 EmotionPanel 同因，避免数据早到引发的结构交换死点击
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  React.useEffect(() => {
    if (!selectedId && assistants && assistants.length > 0) {
      setSelectedId(assistants[0]!.id);
    }
    if (selectedId && assistants && !assistants.some((a) => a.id === selectedId)) {
      setSelectedId(assistants[0]?.id ?? '');
    }
  }, [assistants, selectedId]);

  // 乐观翻转：PUT→重拉窗口内避免受控 checkbox 被服务端旧值弹回
  const [override, setOverride] = React.useState<boolean | null>(null);
  React.useEffect(() => setOverride(null), [settings?.relationshipEnabled]);
  const enabled = override ?? settings?.relationshipEnabled !== false;

  const toggle = async (next: boolean) => {
    setOverride(next);
    try {
      await updateSettings.mutateAsync({ relationshipEnabled: next });
    } catch {
      setOverride(null);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="relationship-panel">
      <div>
        <h3 className="font-medium">{t('settings.relationship.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('settings.relationship.description')}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          data-testid="relationship-enabled-toggle"
          checked={enabled}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">{t('settings.relationship.enable')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('settings.relationship.enableHint')}
          </span>
        </span>
      </label>

      {enabled && (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="relationship-assistant-select">
              {t('settings.emotion.assistant')}
            </Label>
            {hydrated && assistants && assistants.length > 0 ? (
              <select
                id="relationship-assistant-select"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {assistants.map((assistant) => (
                  <option key={assistant.id} value={assistant.id}>
                    {assistant.emoji ? `${assistant.emoji} ` : ''}
                    {assistant.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">{t('settings.emotion.noAssistant')}</p>
            )}
          </div>

          {selectedId && <RelationshipLevelView key={selectedId} assistantId={selectedId} />}
        </div>
      )}

      {!enabled && (
        <p className="text-xs text-muted-foreground">{t('relationship.closed')}</p>
      )}
    </section>
  );
}
