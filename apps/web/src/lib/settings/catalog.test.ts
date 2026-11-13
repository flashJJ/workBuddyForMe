import { describe, expect, it } from 'vitest';
import {
  SETTINGS_PANELS,
  SETTINGS_SECTIONS,
  matchesSettingsQuery,
  normalizeSettingsQuery,
  settingsPanelAnchor,
  settingsPanelHaystack,
  settingsSectionAnchor,
} from './catalog';

describe('设置项索引（P9）', () => {
  it('面板 id 唯一，且分组都存在', () => {
    const ids = SETTINGS_PANELS.map((panel) => panel.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sectionIds = new Set(SETTINGS_SECTIONS.map((section) => section.id));
    for (const panel of SETTINGS_PANELS) {
      expect(sectionIds.has(panel.section)).toBe(true);
    }
  });

  it('每个分组至少有一个面板', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(SETTINGS_PANELS.some((panel) => panel.section === section.id)).toBe(true);
    }
  });

  it('锚点格式保持 #setting-* / #panel-*', () => {
    expect(settingsSectionAnchor('voice')).toBe('setting-voice');
    expect(settingsPanelAnchor('voice-preference')).toBe('panel-voice-preference');
  });

  it('查询分词：多余空白与大小写不影响命中', () => {
    expect(normalizeSettingsQuery('  Quiet   HOURS ')).toEqual(['quiet', 'hours']);
    expect(matchesSettingsQuery('Quiet hours 勿扰', ' quiet  hours ')).toBe(true);
    expect(matchesSettingsQuery('Quiet hours 勿扰', 'quiet backup')).toBe(false);
    expect(matchesSettingsQuery('任意内容', '   ')).toBe(true);
  });

  it('标题、描述与中英别名都可命中', () => {
    const emotion = SETTINGS_PANELS.find((panel) => panel.id === 'emotion');
    const backup = SETTINGS_PANELS.find((panel) => panel.id === 'backup');
    expect(emotion && backup).toBeTruthy();

    const emotionHaystack = settingsPanelHaystack(emotion!, {
      label: '情绪与互动',
      description: '心情、亲密度与互动短句',
      sectionLabel: '情绪与关系',
    });
    expect(matchesSettingsQuery(emotionHaystack, '勿扰')).toBe(true);
    expect(matchesSettingsQuery(emotionHaystack, 'quiet hours')).toBe(true);
    expect(matchesSettingsQuery(emotionHaystack, '情绪 互动')).toBe(true);

    const backupHaystack = settingsPanelHaystack(backup!, {
      label: '备份与恢复',
      description: '本地备份、恢复与导出',
      sectionLabel: '数据与备份',
    });
    expect(matchesSettingsQuery(backupHaystack, 'backup')).toBe(true);
    expect(matchesSettingsQuery(backupHaystack, '导出')).toBe(true);
    expect(matchesSettingsQuery(backupHaystack, '语音')).toBe(false);
  });
});
