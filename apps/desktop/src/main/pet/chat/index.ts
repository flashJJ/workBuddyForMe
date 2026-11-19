import { PET_CHAT_REQUEST_CHANNEL, type PetChatPromptKey } from '@wbfm/shared/pet';

interface ChatTargetWindow {
  isDestroyed?(): boolean;
  webContents: { send(channel: string, payload: unknown): void };
}

/** v4.15：桌宠「聊两句」——唤回主窗到对话页并下发语义键（主窗只预填草稿，不自动发送） */
export function requestPetChat(
  key: PetChatPromptKey,
  focusChat: () => void,
  getMainWindow: () => ChatTargetWindow | null,
): void {
  focusChat();
  const main = getMainWindow();
  if (main && !main.isDestroyed?.()) main.webContents.send(PET_CHAT_REQUEST_CHANNEL, key);
}
