/**
 * v4.19：对话正文与输入区统一宽度。
 *
 * 随视口增长：最小 48rem（768px），中间取 70vw，上限 72rem（1152px）。
 * 消息列表、输入区、提示条共用同一常量，避免各列宽度漂移。
 */
export const CHAT_CONTENT_MAX_WIDTH = 'max-w-[clamp(48rem,70vw,72rem)]';
