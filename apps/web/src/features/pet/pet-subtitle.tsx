'use client';

import type { PetVoiceState } from '@wbfm/shared/pet';

interface Props {
  text: string;
  voiceState: PetVoiceState;
}

const STATE_DOT: Record<PetVoiceState, string> = {
  idle: 'bg-muted-foreground/50',
  listening: 'bg-success',
  thinking: 'bg-warning animate-pulse',
  speaking: 'bg-info',
};

/**
 * 桌宠字幕气泡（说话/识别/思考时显示当前短句）。
 * pointer-events-none：不干扰身体区拖拽与命中上报；底色半透明保证深浅壁纸下可读。
 */
export function PetSubtitle({ text, voiceState }: Props) {
  if (!text && voiceState === 'idle') return null;
  const fallback = voiceState === 'listening' ? '聆听中…' : voiceState === 'thinking' ? '思考中…' : '';
  const content = text || fallback;
  if (!content) return null;
  return (
    <div
      data-testid="pet-subtitle"
      data-state={voiceState}
      className="pointer-events-none absolute inset-x-2 bottom-1 z-20 flex justify-center"
    >
      <div className="flex max-w-full items-center gap-1.5 rounded-full border border-black/10 bg-background/80 px-3 py-1 text-[11px] leading-tight text-foreground shadow-sm backdrop-blur-sm">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[voiceState]}`} />
        <span className="line-clamp-2 break-words">{content}</span>
      </div>
    </div>
  );
}
