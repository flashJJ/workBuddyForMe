/**
 * 桌宠命令与聊天语义键。
 *
 * IPC 只传枚举内的值，不传自由文本；主进程与渲染层共用这一份契约。
 */

/** v3.0 M1：桌宠右键菜单快捷动作（主进程 → 桌宠渲染层执行） */
export const PET_QUICK_ACTIONS = [
  'toggle-mute',
  'toggle-proactive',
  'play-eat-rice',
  'play-called-fat',
] as const;
export type PetQuickAction = (typeof PET_QUICK_ACTIONS)[number];

/** v4.15：桌宠右键「聊两句」的语义键（IPC 只传键，不传自由文本） */
export const PET_CHAT_PROMPT_KEYS = ['greet', 'comfort', 'play'] as const;
export type PetChatPromptKey = (typeof PET_CHAT_PROMPT_KEYS)[number];
/** 主进程 → 主窗「桌宠发起聊天」通道（主窗只预填草稿，不自动发送） */
export const PET_CHAT_REQUEST_CHANNEL = 'pet:chat-request';

/** IPC 边界校验：只放行白名单内的语义键 */
export function isPetChatPromptKey(input: unknown): input is PetChatPromptKey {
  return typeof input === 'string' && (PET_CHAT_PROMPT_KEYS as readonly string[]).includes(input);
}
