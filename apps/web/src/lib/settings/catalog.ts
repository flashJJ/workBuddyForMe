/**
 * P9 设置项索引（纯数据，不引入任何面板组件）。
 *
 * 设置页导航、页内搜索、深链与命令面板共用这一份元数据；
 * 面板渲染节点由 settings-registry.tsx 按 id 映射，避免命令面板把重组件打进主包。
 */
import type { MessageKey } from '@wbfm/shared/i18n';

export type SettingsSectionId =
  | 'base'
  | 'appearance'
  | 'avatar'
  | 'motion'
  | 'voice'
  | 'music'
  | 'emotion'
  | 'events'
  | 'tools'
  | 'agents'
  | 'data'
  | 'about';

export interface SettingsSectionMeta {
  id: SettingsSectionId;
  labelKey: MessageKey;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  { id: 'base', labelKey: 'settings.registry.sections.base' },
  { id: 'appearance', labelKey: 'settings.sections.appearance' },
  { id: 'avatar', labelKey: 'settings.sections.avatar' },
  { id: 'motion', labelKey: 'settings.sections.motion' },
  { id: 'voice', labelKey: 'settings.sections.voice' },
  { id: 'music', labelKey: 'settings.sections.music' },
  { id: 'emotion', labelKey: 'settings.sections.emotion' },
  { id: 'events', labelKey: 'settings.sections.events' },
  { id: 'tools', labelKey: 'settings.sections.tools' },
  { id: 'agents', labelKey: 'settings.sections.agents' },
  { id: 'data', labelKey: 'settings.sections.data' },
  { id: 'about', labelKey: 'settings.sections.about' },
];

export interface SettingsPanelMeta {
  id: string;
  section: SettingsSectionId;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  /** 中英别名，仅用于搜索，不展示 */
  keywords: readonly string[];
}

const p = <const I extends string, const S extends SettingsSectionId, const K extends string>(
  id: I,
  section: S,
  key: K,
  keywords: string[],
): SettingsPanelMeta & { id: I } => ({
  id,
  section,
  labelKey: `settings.registry.panels.${key}.label` as MessageKey,
  descriptionKey: `settings.registry.panels.${key}.description` as MessageKey,
  keywords,
});

const PANEL_LIST = [
  p('demo-mode', 'base', 'demoMode', ['demo', '演示', '模拟', '试用', 'mock']),
  p('providers', 'base', 'providers', ['provider', '供应商', '模型', 'api', 'key', '接口']),
  p('defaults', 'base', 'defaults', ['default', '默认', '主题', 'theme', '数据目录', 'data dir']),
  p('appearance', 'appearance', 'appearance', ['theme', '主题', '外观', '深色', '浅色', 'dark', 'light', '配色']),
  p('avatar-import', 'avatar', 'avatarImport', ['vrm', '模型', '导入', 'import', '形象', 'avatar']),
  p('avatar-list', 'avatar', 'avatarList', ['vrm', '形象', '角色模型', 'avatar', '切换', '模型列表']),
  p('motion-import', 'motion', 'motionImport', ['vrma', '动作', '导入', 'motion', 'animation', 'import']),
  p('motion-list', 'motion', 'motionList', ['动作库', 'motion', 'animation', '预览', '列表']),
  p('voice-preference', 'voice', 'voicePreference', ['voice', '语音', '声线', 'tts', '语速', '朗读']),
  p('music-library', 'music', 'musicLibrary', ['music', '音乐', '背景音乐', 'bgm', '主题曲', '导入歌曲', '氛围']),
  p('work-signal', 'voice', 'workSignal', ['work', '工作', '状态', '感知', '深夜', 'idle']),
  p('emotion', 'emotion', 'emotion', ['emotion', '情绪', '心情', '互动', '勿扰', 'quiet hours']),
  p('relationship', 'emotion', 'relationship', ['relationship', '关系', '等级', '称呼', '亲密度']),
  p('relationship-report', 'emotion', 'relationshipReport', ['report', '报告', '关系', '纪念']),
  p('interaction-graph', 'emotion', 'interactionGraph', ['graph', '图谱', '互动', '偏好']),
  p('events', 'events', 'events', ['scene', '剧情', '演出', '早安', '晚安', '小剧场']),
  p('script-schedule', 'events', 'scriptSchedule', ['script', '剧本', 'AI 剧情', '自动生成', '每日', '回顾', 'journal', '主动播放', '空闲', 'proactive', 'playback']),
  p('reminder', 'events', 'reminder', ['reminder', '提醒', '定时', '闹钟', '日程']),
  p('search-settings', 'tools', 'searchSettings', ['search', '搜索', '联网', 'searxng', 'brave', 'tavily']),
  p('mcp', 'tools', 'mcp', ['mcp', '服务器', 'server', '工具', '目录']),
  p('permissions', 'tools', 'permissions', ['permission', '权限', '确认', '审批', 'approval']),
  p('tool-breaker', 'tools', 'toolBreaker', ['breaker', '熔断', '失败', '重试']),
  p('tool-debug', 'tools', 'toolDebug', ['debug', '调试', '工具', '日志']),
  p('capability-trust', 'tools', 'capabilityTrust', ['capability', '能力', '信任', 'trust', '来源']),
  p('agent-governance', 'tools', 'agentGovernance', ['agent', '智能体', '治理', 'governance', '约束']),
  p('branch-limits', 'tools', 'branchLimits', ['branch', '分支', '限制', 'limit', '资源']),
  p('skills', 'agents', 'skills', ['skill', '技能', '插件', 'skill pack']),
  p('subagent', 'agents', 'subagent', ['subagent', '子智能体', '协作']),
  p('tuning', 'agents', 'tuning', ['tuning', '调优', '行为', '参数']),
  p('character-cards', 'data', 'characterCards', ['card', '角色卡', '人设', 'persona']),
  p('knowledge-retrieval', 'data', 'knowledgeRetrieval', ['knowledge', '知识', '检索', 'rag', '向量', '引用']),
  p('mod-pack', 'data', 'modPack', ['mod', '模组', '扩展', 'pack']),
  p('memory', 'data', 'memory', ['memory', '记忆', '召回', '长期记忆']),
  p('backup', 'data', 'backup', ['backup', '备份', '恢复', 'restore', '导出', 'export']),
  p('artifact-pack', 'data', 'artifactPack', ['artifact', '产出', '打包', '分享']),
  p('storage-cleanup', 'data', 'storageCleanup', ['storage', '存储', '清理', '缓存', '空间']),
  p('help-center', 'about', 'helpCenter', ['help', '帮助', '指南', 'faq', '文档']),
  p('about', 'about', 'about', ['about', '关于', '版本', 'version', '许可', '更新', 'update']),
];

export type SettingsPanelId = (typeof PANEL_LIST)[number]['id'];

export type SettingsPanel = SettingsPanelMeta & { id: SettingsPanelId };

export const SETTINGS_PANELS: readonly SettingsPanel[] = PANEL_LIST;

export function settingsSectionAnchor(id: SettingsSectionId): string {
  return `setting-${id}`;
}

export function settingsPanelAnchor(id: string): string {
  return `panel-${id}`;
}

/** 搜索词按空白分词并小写；空查询表示不过滤 */
export function normalizeSettingsQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 全部词都出现在 haystack 中才算命中（大小写不敏感） */
export function matchesSettingsQuery(haystack: string, query: string): boolean {
  const tokens = normalizeSettingsQuery(query);
  if (tokens.length === 0) return true;
  const text = haystack.toLowerCase();
  return tokens.every((token) => text.includes(token));
}

/** 单个设置项的搜索文本：标题 + 描述 + 别名 + 分组名 */
export function settingsPanelHaystack(
  meta: SettingsPanelMeta,
  resolved: { label: string; description: string; sectionLabel: string },
): string {
  return [resolved.label, resolved.description, resolved.sectionLabel, meta.section, ...meta.keywords].join(' ');
}
