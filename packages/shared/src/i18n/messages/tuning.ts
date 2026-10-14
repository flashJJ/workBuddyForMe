/** v1.8 M3 调优中心词条（中文 + English） */

export const zhTuning = {
  title: '调优中心',
  description: '模型绑定、采样手感、上下文条数与全局提示词，聚合在一处调整；与助手表单同源同存。',
  assistantLabel: '调整对象',
  assistantAllHint: '采样与场景模型按助手保存；上下文条数与全局提示词为全局设置。',
  // 场景模型矩阵
  matrix: {
    title: '场景模型矩阵',
    description: '五个场景的模型绑定一页可见；留空即显式跟随默认。',
    scenarioChat: '聊天',
    scenarioMemory: '记忆提取',
    scenarioPlanner: 'Planner（规划）',
    scenarioExecutor: 'Executor（执行）',
    scenarioReviewer: 'Reviewer（审查）',
    followDefault: '跟随默认对话模型',
    followAssistant: '跟随助手/系统默认',
    memoryReadonlyHint: 'v1.8 不可改，回落默认对话模型',
    weakModelHint: '小模型建议温度 ≤0.7，并关闭协作审查以节省轮次。',
  },
  // 常用区
  common: {
    title: '常用',
    temperature: 'Temperature（0–2）',
    temperatureHint: '越高越发散，0.7 适合大多数本地小模型。',
    contextCount: '上下文条数（2–50）',
    contextCountHint: '每轮最多携带最近多少条历史；先按条数裁剪，再按模型窗口做 token 裁剪。',
    contextCountValue: '{count} 条',
  },
  // 高级区
  advanced: {
    title: '高级',
    show: '展开高级项',
    hide: '收起高级项',
    topP: 'Top P（0–1）',
    maxTokens: '最大输出 Token（空=不限）',
    expression: '表情指令输出',
    expressionHint: '关闭后该助手回复不再插入表情标签（全局情绪开关在情绪面板）。',
    personalitySummary: '人格四权重（坦率/傲娇/害羞/包容）',
    personalityReadonlyHint: '滑块仍在助手表单，这里只读汇总：{values}',
    restore: '恢复该助手默认手感',
    restoreConfirm: '把该助手的温度、Top P、最大 Token 与三角色模型恢复为默认？角色卡与其他设置不变。',
    restored: '已恢复默认手感',
  },
  // 全局追加
  append: {
    title: '全局追加提示词',
    description: '固定注入在角色卡之后、情绪段之前，对所有助手生效；留空或关闭即不注入。',
    enabled: '启用全局追加',
    placeholder: '例如：始终用中文回答；引用资料时标注来源；不使用 Markdown 表格。',
    charCount: '{count}/2000',
  },
};

export const enTuning = {
  title: 'Tuning center',
  description:
    'Model bindings, sampling feel, context message count and the global prompt in one place. Saved through the same source as the assistant form.',
  assistantLabel: 'Target assistant',
  assistantAllHint:
    'Sampling and scenario models are per-assistant; context count and the global prompt are global settings.',
  matrix: {
    title: 'Scenario model matrix',
    description: 'Model bindings for all five scenarios on one page; blank means explicitly following the default.',
    scenarioChat: 'Chat',
    scenarioMemory: 'Memory extraction',
    scenarioPlanner: 'Planner',
    scenarioExecutor: 'Executor',
    scenarioReviewer: 'Reviewer',
    followDefault: 'Follow default chat model',
    followAssistant: 'Follow assistant/system default',
    memoryReadonlyHint: 'Not editable in v1.8 — falls back to the default chat model',
    weakModelHint: 'For small models, keep temperature ≤0.7 and disable review to save rounds.',
  },
  common: {
    title: 'Common',
    temperature: 'Temperature (0–2)',
    temperatureHint: 'Higher is more creative; 0.7 suits most local small models.',
    contextCount: 'Context messages (2–50)',
    contextCountHint:
      'At most this many recent messages per turn. Count clipping runs first, then token-budget clipping for the model window.',
    contextCountValue: '{count} messages',
  },
  advanced: {
    title: 'Advanced',
    show: 'Show advanced',
    hide: 'Hide advanced',
    topP: 'Top P (0–1)',
    maxTokens: 'Max output tokens (blank = unlimited)',
    expression: 'Expression tag output',
    expressionHint:
      'When off, this assistant no longer emits expression tags (the global emotion switch is on the Emotion panel).',
    personalitySummary: 'Personality weights (frank/tsundere/shy/tolerant)',
    personalityReadonlyHint: 'Sliders stay in the assistant form; read-only summary here: {values}',
    restore: 'Restore default feel for this assistant',
    restoreConfirm:
      'Reset temperature, Top P, max tokens and the three role models to defaults? The character card and other settings are untouched.',
    restored: 'Default feel restored',
  },
  append: {
    title: 'Global appended prompt',
    description:
      'Injected after the character card and before the emotion block for every assistant. Empty or disabled means no injection.',
    enabled: 'Enable global append',
    placeholder:
      'e.g. Always answer in Chinese; cite sources when referencing material; avoid Markdown tables.',
    charCount: '{count}/2000',
  },
};
