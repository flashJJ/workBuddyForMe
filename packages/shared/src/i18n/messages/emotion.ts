/** emotion 命名空间：v1.6 情绪/关系状态展示（等级文案、事件与来源；面板文案在 settings.emotion） */
export const zhEmotion = {
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
    default: '常规回合',
  },
  /** M3：摸头本地短句（随机抽取，零模型调用） */
  touch: {
    blush0: '嗯……怎么啦？',
    blush1: '嘿嘿，有点痒~',
    blush2: '摸摸头，电量加一。',
    blush3: '今天也辛苦你啦。',
    blush4: '再多陪我一会儿嘛。',
    blush5: '被你摸得有点不好意思了。',
    protect0: '呜，头发都被你弄乱啦！',
    protect1: '再摸我可要收摸摸费了哦。',
    protect2: '够了够了，让我歇一会儿嘛~',
    protect3: '哼，再摸我就不理你了。',
  },
};

export const enEmotion: typeof zhEmotion = {
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
    default: 'Ordinary turn',
  },
  /** M3: local head-pet lines (random, no model call) */
  touch: {
    blush0: 'Hm... what is it?',
    blush1: 'Hehe, that tickles~',
    blush2: 'Head pats: battery +1.',
    blush3: "You've worked hard today too.",
    blush4: 'Stay with me a little longer.',
    blush5: "You're making me a little shy.",
    protect0: 'Hey, my hair is getting messy!',
    protect1: 'Keep this up and I will start charging petting fees.',
    protect2: 'Okay okay, let me rest for a bit~',
    protect3: "Hmph, pet me again and I'll ignore you.",
  },
};
