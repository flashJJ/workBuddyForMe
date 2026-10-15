/**
 * relationship 命名空间：v2.0 关系等级面板（zh-CN 结构真源 + en 全覆盖）。
 * 文案纪律（03 契约 §9）：不出现「还差 X 分」「连续 N 天」「快回来」类
 * 打卡/愧疚措辞；降级无主动通知；等级是质感而非 KPI。
 */
export const zhRelationship = {
  /** 四档名称（模型注入文案同样取 zh 真源，与 emotion-prompt 惯例一致） */
  level: {
    0: '陌生',
    1: '认识',
    2: '搭档',
    3: '挚友',
  },
  /** 当前等级的文案化提示：只描述相处质感，不给分数差/进度条 */
  hint: {
    0: '刚刚认识。多进行一些自然的日常对话，就会慢慢熟悉起来。',
    1: '已经能认出彼此了。再多一些日常相处，会变得更亲近。',
    2: '你们是配合默契的搭档，一起搞定过不少事。',
    3: '你们是彼此信任的挚友，亲近又可靠。',
  },
  /** 面板里每个等级档的一句话剪影（待解锁档也可见，不制造稀缺恐吓） */
  milestone: {
    1: '几次自然对话之后，就会认识彼此。',
    2: '在日复一日的相处与协作中，会成为搭档。',
    3: '亲近，并且在托付的事情上始终可靠，才会成为挚友。',
  },
  unlocks: {
    title: '随等级解锁',
    /** 角色卡按等级配置的专属称呼 */
    nickname: '专属称呼',
    /** 升级瞬间的纪念小演出 */
    scene: '升级纪念演出',
    unlocked: '已解锁',
    locked: '尚未解锁',
  },
  rules: {
    title: '等级是怎么变化的',
    body: '等级来自日常相处中积累的亲近与信任，不是打卡积分：它会随自然对话慢慢提升，每天能积累的好感有上限，刻意刷并没有意义。很长一段时间没有正向互动时，等级只会缓慢回落，且永远不低于「认识」、不会清零；重新熟络之后可以再升回来。',
  },
  /** 等级时间线/重置等复用短语 */
  highestEver: '曾经到达过「{level}」',
  closed: '关系等级已关闭，当前为纯工具模式，等级不会变化。',
};

export const enRelationship: typeof zhRelationship = {
  level: {
    0: 'Stranger',
    1: 'Acquainted',
    2: 'Partner',
    3: 'Confidant',
  },
  hint: {
    0: 'You just met. A few natural conversations will slowly make you familiar.',
    1: 'You recognize each other now. More everyday time together brings you closer.',
    2: 'You are well-coordinated partners who have handled a lot together.',
    3: 'You are trusted confidants — close and reliable to each other.',
  },
  milestone: {
    1: 'A few natural conversations, and you become acquainted.',
    2: 'Through daily company and collaboration, you become partners.',
    3: 'Closeness plus steady reliability earns confidants.',
  },
  unlocks: {
    title: 'Unlocked by level',
    nickname: 'Exclusive nickname',
    scene: 'Level-up keepsake scene',
    unlocked: 'Unlocked',
    locked: 'Not yet unlocked',
  },
  rules: {
    title: 'How levels change',
    body: 'Levels grow from the closeness and trust built in everyday company — they are not check-in points. They rise slowly through natural chats, and the goodwill that can accumulate each day is capped, so grinding is pointless. After a long stretch without positive interaction a level can only ease back slowly, never below Acquainted and never to zero; it can be earned again by reconnecting.',
  },
  highestEver: 'Once reached “{level}”',
  closed: 'Relationship levels are off. This is a tool-only mode; levels do not change.',
};
