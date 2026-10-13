/**
 * event-m5 命名空间：v1.7 M5 自定义短语触发器与打扰率统计（zh-CN 结构真源）。
 * 剧本台词仍在 event.*；设置面板三档/勿扰在 settings.events.*。
 */
export const zhEventM5 = {
  customTriggers: {
    title: '自定义短语触发',
    description: '消息里包含指定短语时，让助手演一段对应剧本（仅本地匹配，不会上传短语）。',
    addAction: '新建规则',
    empty: '还没有自定义规则，添加短语试试，比如「夸夸我」。',
    createTitle: '新建触发规则',
    editTitle: '编辑触发规则',
    saving: '保存中…',
    assistantLabel: '归属助手',
    assistantPlaceholder: '选择规则所属助手',
    eventLabel: '触发剧本',
    phrasesLabel: '触发短语（每行一条）',
    phrasesPlaceholder: '例如：\n夸夸我\n辛苦了',
    phrasesHint: '包含匹配，最多 30 条，每条最长 24 字；自动去重。',
    tooManyPhrases: '最多 30 条短语',
    cooldownLabel: '冷却时间',
    maxPerDayLabel: '每日上限',
    windowLabel: '有效时段',
    windowStart: '开始小时',
    windowEnd: '结束小时',
    windowHour: '点（相同=全天，跨夜如 22-6）',
    minIntimacyLabel: '最低亲密度',
    enabledLabel: '启用该规则',
    unitMinute: '分钟',
    unitHour: '小时',
    perDaySuffix: '次/天',
    hourSuffix: '点',
  },
  eventStats: {
    title: '打扰率统计（近 30 天）',
    selectAssistant: '选择助手',
    played: '完整演出',
    acceptRate: '接受率',
    interruptRate: '打断率',
    noData: '这段时间还没有演出记录。',
    downgradeHint: '打断率偏高：建议在上方把主动频率调低一档（不会自动修改设置）。',
  },
};
