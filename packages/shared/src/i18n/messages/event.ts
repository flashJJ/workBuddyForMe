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
  },
  touch: {
    shy: {
      title: '连摸害羞',
      shy0: '别、别一直摸头啦。',
      shy1: '再摸要收摸摸费了哦。',
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
