'use client';

import type { PetVoiceState } from '@wbfm/shared/pet';

/** 桌宠字幕气泡：本地短句（摸头/久别）优先于语音中继字幕 */
export function PetSubtitleBubble({
  text,
  voiceState,
  shifted,
}: {
  text: string;
  voiceState: PetVoiceState;
  shifted: boolean;
}) {
  if (!text.trim()) return null;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${
        shifted ? 'top-[18%]' : 'top-[4%]'
      }`}
    >
      <div
        className="line-clamp-3 max-w-[85%] break-words rounded-xl border border-border/50 bg-background/85 px-3 py-1.5 text-center text-sm leading-relaxed text-foreground shadow-sm backdrop-blur-sm"
        data-testid="pet-subtitle"
        data-voice-state={voiceState}
      >
        {text}
      </div>
    </div>
  );
}
