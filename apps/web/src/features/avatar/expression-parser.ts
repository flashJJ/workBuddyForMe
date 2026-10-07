/**
 * 表情指令纯函数（M3，客户端流式辅助）。
 *
 * 规范标签集合、别名归一、展示文本剥离都在 @wbfm/shared（服务端/客户端同源，
 * 分享导出、消息渲染共用）；这里只补「从累积文本中取表情序列/当前表情」两个流式 helper。
 */
import {
  DEFAULT_EXPRESSION,
  EXPRESSION_TAGS,
  normalizeExpressionName,
  stripExpressionDirectives,
  type ExpressionTag,
} from '@wbfm/shared';

export { DEFAULT_EXPRESSION, EXPRESSION_TAGS, stripExpressionDirectives, type ExpressionTag };

const TAG_PATTERN = /\[([a-z]{2,12})\]/gi;

export interface ExpressionHit {
  tag: ExpressionTag;
  /** 标签在原文中的起始下标（"[" 的位置） */
  index: number;
  /** 命中的原始词（小写） */
  raw: string;
}

/** 按出现顺序提取全部可识别表情标签（别名已归一） */
export function parseExpressionTags(text: string): ExpressionHit[] {
  const hits: ExpressionHit[] = [];
  for (const match of text.matchAll(TAG_PATTERN)) {
    const index = match.index;
    const token = match[1]?.toLowerCase() ?? '';
    const tag = normalizeExpressionName(token);
    if (index !== undefined && tag) hits.push({ tag, index, raw: token });
  }
  return hits;
}

/** 文本中最后一个表情标签（流式累积文本每帧调用，驱动当前表情）；无标签返回 null */
export function latestExpression(text: string): ExpressionTag | null {
  return parseExpressionTags(text).at(-1)?.tag ?? null;
}
