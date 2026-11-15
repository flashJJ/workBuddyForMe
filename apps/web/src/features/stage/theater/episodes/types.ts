import type {
  ExpressionTag,
  StageCastMember,
  StageExpressionIntensity,
  StageMotionGroup,
  StageSlot,
} from '@wbfm/shared/schemas';

/** S3 剧场背景变体：幕布 / 只打光 / 关闭 */
export type TheaterBackdropVariant = 'curtain' | 'spotlight' | 'none';

/** 剧集类型标签：驱动配乐与音效气质 */
export type TheaterGenre = 'comedy' | 'slice-of-life' | 'tragedy' | 'mystery';

/** 背景音乐情绪；由剧集/幕标签推导，也可显式覆盖 */
export type TheaterMusicMood = 'warm' | 'playful' | 'tense' | 'melancholy';

export interface TheaterLine {
  slot: StageSlot;
  text: string;
  /** en-US 台词；缺省回落中文 */
  textEn?: string;
  expression: ExpressionTag;
  /** 表情强度：缺省 2（中）；VRM 走 KK morph 组合，Live2D 忽略 */
  expressionIntensity?: StageExpressionIntensity;
  motion: StageMotionGroup;
  /** 显式动作 cue；缺省按 motion 分组映射（见 stage-motion-adapter） */
  motionId?: string;
  behaviorId?: string;
}

/** 一幕：用半开区间 [from, to) 指向剧集台词，切换背景/音乐/类型 */
export interface TheaterAct {
  id: string;
  title: string;
  titleEn?: string;
  from: number;
  to: number;
  backdrop?: TheaterBackdropVariant;
  music?: TheaterMusicMood;
  genre?: TheaterGenre;
}

export interface TheaterEpisode {
  id: string;
  title: string;
  /** en-US 标题；缺省回落中文 */
  titleEn?: string;
  cast: StageCastMember[];
  lines: TheaterLine[];
  /** 剧集类型标签；首个标签用于兜底配乐气质 */
  genres: TheaterGenre[];
  /** 每集可覆盖剧场背景；默认幕布 */
  backdrop?: TheaterBackdropVariant;
  /** 剧集级配乐情绪；缺省按 genres[0] 推导 */
  music?: TheaterMusicMood;
  acts?: TheaterAct[];
}
