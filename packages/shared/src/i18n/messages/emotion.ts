/** emotion 命名空间：v1.6 情绪/关系状态展示（面板、等级文案、事件与来源） */
export const zhEmotion = {
  panel: {
    title: '情绪与互动',
    description: '角色会记住相处中的心情变化：情绪会随时间平复，亲密与信任缓慢积累。',
    sectionState: '当前状态',
    enableEmotion: '启用情绪状态',
    enableEmotionHint: '关闭后不再识别与积累情绪，表情只跟随当前回复',
    reset: '重置情绪与关系',
    resetConfirm: '将清空与该助手的心情、亲密度、信任度与最近事件，且不可恢复。确定重置吗？',
  },
  mood: {
    happiness: '心情',
    anger: '生气',
    sadness: '难过',
  },
  relation: {
    intimacy: '亲密度',
    trust: '信任度',
  },
  need: {
    label: '当前需求',
    none: '无',
    attention: '想要陪伴',
    comfort: '需要安慰',
    play: '想玩一会儿',
    rest: '想休息',
  },
  levels: {
    mood: {
      veryLow: '明显低落',
      low: '轻微低落',
      none: '平静',
      slight: '有一点',
      evident: '明显',
      strong: '很强烈',
    },
    relation: {
      low: '还陌生',
      building: '逐渐熟悉',
      high: '比较亲近',
      veryHigh: '非常亲密',
    },
  },
  event: {
    praise: '被夸奖',
    chat: '日常相处',
    belittle: '被数落',
  },
  source: {
    model: '模型识别',
    rule: '规则识别',
    event: '剧情事件',
    manual: '手动设置',
  },
};

export const enEmotion: typeof zhEmotion = {
  panel: {
    title: 'Emotion & interaction',
    description:
      'Your companion remembers the emotional tone of your time together: moods fade over time, while intimacy and trust build slowly.',
    sectionState: 'Current state',
    enableEmotion: 'Enable emotional state',
    enableEmotionHint: 'When off, emotions are not detected or stored; expressions follow the current reply only',
    reset: 'Reset mood and relationship',
    resetConfirm:
      'This clears mood, intimacy, trust and recent events with this assistant. This cannot be undone. Reset anyway?',
  },
  mood: {
    happiness: 'Mood',
    anger: 'Anger',
    sadness: 'Sadness',
  },
  relation: {
    intimacy: 'Intimacy',
    trust: 'Trust',
  },
  need: {
    label: 'Current need',
    none: 'None',
    attention: 'Wants company',
    comfort: 'Needs comfort',
    play: 'Wants to play',
    rest: 'Needs rest',
  },
  levels: {
    mood: {
      veryLow: 'Very low',
      low: 'A little low',
      none: 'Calm',
      slight: 'Slight',
      evident: 'Evident',
      strong: 'Strong',
    },
    relation: {
      low: 'Strangers',
      building: 'Getting familiar',
      high: 'Close',
      veryHigh: 'Very close',
    },
  },
  event: {
    praise: 'Praised',
    chat: 'Everyday chat',
    belittle: 'Belittled',
  },
  source: {
    model: 'Detected by model',
    rule: 'Detected by rules',
    event: 'Story event',
    manual: 'Manual',
  },
};
