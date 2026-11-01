/** @子域 barrel pet/bridge：桌宠桥与运行时（跨域能力入口） */
export {
  PET_HIT,
  getPetBridge,
  isPetBodyPoint,
  isPetHitPoint,
  readPetModelId,
} from '../pet-bridge';
export { usePetBridge } from '../use-pet-bridge';
export type { PetRuntime } from '../use-pet-bridge';
export { usePetOpenState, usePetVoiceRelay } from '../use-pet-voice-relay';
export { useChatPetRelay } from '../use-chat-pet-relay';
