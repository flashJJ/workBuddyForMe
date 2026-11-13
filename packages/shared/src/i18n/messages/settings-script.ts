/** P8.6 settings.script 子命名空间：AI 日常剧情自动生成开关（拆分守行数门禁） */
export const zhSettingsScript = {
  title: 'AI 日常剧情',
  description:
    '让 AI 每天写一小段剧本，台词与动作限定在已注册的原语里；断网或校验失败会自动回落到本地剧本。',
  enabled: '启用每日自动生成',
  enabledHint:
    '默认关闭。开启后启动时检查一次，之后每小时检查一次；距上次超过 30 分钟才会触发，失败也会计入次数。勿扰时段内会跳过且不计次；每日次数设为 0 表示不生成。',
  perDay: '每日次数',
  perDayUnit: '次',
  today: '今日已自动生成 {runs}/{limit} 次',
  retention: '回顾保留',
  retentionHint: '默认永久保留；也可以只保留最近 7/30/90/365 天，旧记录会自动清理。',
  retentionDays: '{days} 天',
  retentionForever: '永久',
  playbackTitle: '主动播放',
  playbackHint:
    '空闲且不在勿扰时段时，她会从已生成的剧本里挑一场主动演出；播放前先扣当日场次，同一场不会重复。',
  playbackPerDay: '每日主动播放',
  playbackPerDayUnit: '场',
  playbackIdle: '空闲触发',
  playbackIdleUnit: '分钟后',
  playbackToday: '今日已主动播放 {plays}/{limit} 场',
  saving: '保存中…',
  saveFailed: '设置保存失败',
};

export const enSettingsScript = {
  title: 'AI daily stories',
  description:
    'Let the AI write a short script each day. Lines and actions are limited to registered primitives, and it falls back to local scripts offline or when validation fails.',
  enabled: 'Enable daily auto-generation',
  enabledHint:
    'Off by default. When on, it checks once at startup and then hourly; a run happens only if 30 minutes have passed since the last one. Failed runs also count. Quiet hours are skipped without consuming a run. Set daily runs to 0 to disable generation.',
  perDay: 'Runs per day',
  perDayUnit: 'runs',
  today: 'Auto-generated today: {runs}/{limit}',
  retention: 'Journal retention',
  retentionHint:
    'Keep everything by default, or keep only the last 7/30/90/365 days; older entries are cleaned up automatically.',
  retentionDays: '{days} days',
  retentionForever: 'Forever',
  playbackTitle: 'Proactive playback',
  playbackHint:
    'When idle outside quiet hours, she performs a generated scene on her own. The daily budget is claimed before playing, and the same scene is never replayed.',
  playbackPerDay: 'Plays per day',
  playbackPerDayUnit: 'plays',
  playbackIdle: 'Trigger after idle',
  playbackIdleUnit: 'min',
  playbackToday: 'Played proactively today: {plays}/{limit}',
  saving: 'Saving…',
  saveFailed: 'Failed to save settings',
};
