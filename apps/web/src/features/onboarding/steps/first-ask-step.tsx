'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import { useVoiceSettings } from '@/features/voice/use-voice-settings';
import { setPendingFirstAsk } from '../first-ask';

/**
 * v2.4 M1 T6：向导 firstAsk 步——给 3 个预置示例问题，点一下即发问并落到 /chat 看流式回复。
 * 示例按已就绪能力显隐（M0 §6）：通用常显；有知识库时给知识库问法；语音模型就绪时给语音问法。
 * 也可直接「继续」跳过本步。
 */
export function FirstAskStep({ onPick }: { onPick: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const { data: knowledgeBases } = useKnowledgeBases();
  const { modelStatus } = useVoiceSettings();

  const suggestions: Array<{ id: string; text: string }> = [
    { id: 'general', text: t('onboarding.firstAsk.general') },
    ...((knowledgeBases?.length ?? 0) > 0
      ? [{ id: 'knowledge', text: t('onboarding.firstAsk.knowledge') }]
      : []),
    ...(modelStatus?.ttsReady ? [{ id: 'voice', text: t('onboarding.firstAsk.voice') }] : []),
  ];

  const choose = (text: string) => {
    setPendingFirstAsk(text);
    onPick();
    router.push('/chat');
  };

  return (
    <div className="space-y-4" data-testid="onboarding-firstask">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('onboarding.firstAsk.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.firstAsk.lead')}</p>
      </div>
      <div className="space-y-2">
        {suggestions.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant="outline"
            className="h-auto w-full justify-start whitespace-normal py-2 text-left"
            data-testid={`ob-firstask-${item.id}`}
            onClick={() => choose(item.text)}
          >
            {item.text}
          </Button>
        ))}
      </div>
    </div>
  );
}
