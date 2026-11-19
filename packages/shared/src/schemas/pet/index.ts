/** 桌宠域契约：命令/聊天语义键与模型 id 归一 */
export {
  PET_CHAT_PROMPT_KEYS,
  PET_CHAT_REQUEST_CHANNEL,
  PET_QUICK_ACTIONS,
  isPetChatPromptKey,
} from './commands';
export type { PetChatPromptKey, PetQuickAction } from './commands';
export { normalizeAvatarModelId } from './model';
