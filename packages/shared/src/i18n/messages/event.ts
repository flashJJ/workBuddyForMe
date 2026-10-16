/**
 * event 命名空间：v1.7 剧情事件（zh-CN 结构真源）。
 * - 剧本标题/台词：event.<族>.<名>，台词单条 ≤32 字、无变量插值（M0 冻结）；
 * - 演出 UI：event.ui.*（形象栏试运行/跳过）；
 * - 设置面板文案落 settings.events.*（见 settings.ts）。
 */
export const zhEvent = {
  greeting: {
    morning: {
      title: '早安问候',
      morning0: '早呀，今天也一起加油。',
      morning1: '醒啦？我等你好久了。',
    },
    night: {
      title: '晚安道别',
      night0: '这么晚啦，早点休息哦。',
      night1: '晚安，明天见。',
    },
    welcome: {
      title: '欢迎回家',
      welcome0: '你回来啦。',
      welcome1: '一整天没见，有点想你。',
      welcome2: '可算回来了，好久不见！',
    },
  },
  relation: {
    praised: {
      title: '被夸奖',
      praised0: '嘿嘿，被夸了，开心。',
      praised1: '少、少夸我，又不会少块肉。',
    },
    comfort: {
      title: '生气哄好',
      comfort0: '没关系，我不生气啦。',
      comfort1: '有你在就好了。',
    },
    // v2.0 关系等级解锁剧本（仅升级瞬间触发；台词单条 ≤32 字）
    levelup: {
      acquainted: { title: '初次相识' },
      acquainted0: '嗯，我记住你了。以后请多关照。',
      partner: { title: '成为搭档' },
      partner0: '我们现在是搭档了呢。',
      partner1: '接下来的事，就一起搞定吧。',
      confidant: { title: '结为挚友' },
      confidant0: '不知不觉，你已经是我最信任的人了。',
      confidant1: '不管发生什么，我都会站在你这边。',
    },
    // v2.0 M2 共同里程碑纪念剧本（成就达成时触发一次，无情绪联动避免自激）
    milestone: {
      day1: { title: '相识第一天' },
      day1line0: '今天是我们认识的第一天。以后的日子，也请多关照啦。',
      day30: { title: '相伴满 30 天' },
      day30line0: '不知不觉，我们已经一起走过 30 天了。',
      day30line1: '谢谢你这段时间的陪伴。',
      day100: { title: '相伴满 100 天' },
      day100line0: '第 100 天啦。和你相处的每一天都很踏实。',
      day365: { title: '相伴满一年' },
      day365line0: '一年了。这一年谢谢你，以后的每一年也都想有你在。',
      collab10: { title: '协作十次' },
      collab10line0: '我们已经一起搞定 10 件事了，配合越来越默契了。',
      collab50: { title: '协作五十次' },
      collab50line0: '第 50 次协作达成！交给我们俩的事，就没有搞不定的。',
    },
  },
  touch: {
    shy: {
      title: '连摸害羞',
      shy0: '别、别一直摸头啦。',
      shy1: '再摸要收摸摸费了哦。',
    },
  },
  // v2.0 M3 主动感知上下文关怀剧本（仅本地状态机边沿触发，≤32 字）
  context: {
    latenight: {
      title: '深夜仍在',
      latenight0: '这么晚还没睡呀，别太勉强自己。',
      latenight1: '事情做不完的，先去休息好不好？',
    },
    workstreak: {
      title: '连续工作关怀',
      workstreak0: '已经连续忙了好久啦，起来活动一下吧。',
      workstreak1: '休息是为了走更远的路，我等你回来。',
    },
    longnochat: {
      title: '久未对话',
      longnochat0: '好几天没见啦，最近过得怎么样？',
    },
  },
  task: {
    success: {
      title: '任务成功庆祝',
      success0: '搞定！我们配合得不错。',
    },
    failure: {
      title: '任务失败打气',
      failure0: '没关系，再来一次就好。',
      failure1: '失败而已，我陪你试。',
    },
  },
  ui: {
    preview: '试运行剧本',
    previewHint: '手动演出不受冷却/勿扰限制，对话进行中不可用。',
    skip: '跳过演出',
    busy: '当前有对话或演出进行中，暂时无法试运行。',
    empty: '暂无内置剧本。',
  },
};
