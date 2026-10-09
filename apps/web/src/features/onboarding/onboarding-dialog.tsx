'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  isFirstStep,
  isLastStep,
  nextStep,
  prevStep,
  stepIndex,
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from './onboarding-state';
import { WelcomeStep } from './steps/welcome-step';
import { ProviderStep } from './steps/provider-step';
import { VoiceStep } from './steps/voice-step';
import { FinishStep } from './steps/finish-step';

/** 步骤名 i18n 键映射（动态 t() 需要编译期合法键） */
const STEP_NAME_KEYS: Record<OnboardingStepId, MessageKey> = {
  welcome: 'onboarding.stepNames.welcome',
  provider: 'onboarding.stepNames.provider',
  voice: 'onboarding.stepNames.voice',
  finish: 'onboarding.stepNames.finish',
};

interface Props {
  open: boolean;
  /** 跳过或最后一步「进入应用」均触发；由宿主写 hasOnboarded=true */
  onComplete: () => void;
}

/**
 * 首启向导容器（v1.2 M5）：
 * - 模态遮罩不可被 Esc/点外部关闭（onOpenChange 忽略），只能「下一步」或「跳过」
 * - 步骤组件均为可跳过的引导，不做强制表单校验
 */
export function OnboardingDialog({ open, onComplete }: Props) {
  const { t } = useI18n();
  const [step, setStep] = React.useState<OnboardingStepId>('welcome');

  React.useEffect(() => {
    if (open) setStep('welcome');
  }, [open]);

  const last = isLastStep(step);

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-xl"
        data-testid="onboarding-dialog"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('onboarding.title')}</DialogTitle>
          <DialogDescription>
            {t('onboarding.stepBadge', { current: stepIndex(step) + 1, total: ONBOARDING_STEPS.length })}
            {' · '}
            {t(STEP_NAME_KEYS[step]!)}
          </DialogDescription>
        </DialogHeader>

        {step === 'welcome' && <WelcomeStep />}
        {step === 'provider' && <ProviderStep />}
        {step === 'voice' && <VoiceStep />}
        {step === 'finish' && <FinishStep />}

        <div className="mt-2 flex items-center justify-between gap-2">
          <div>
            {!last && (
              <Button type="button" variant="ghost" size="sm" onClick={onComplete} data-testid="ob-skip">
                {t('common.actions.skip')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isFirstStep(step) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => prevStep(s))}
                data-testid="ob-back"
              >
                {t('common.actions.back')}
              </Button>
            )}
            {last ? (
              <Button type="button" onClick={onComplete} data-testid="ob-enter">
                {t('onboarding.finish.enter')}
              </Button>
            ) : (
              <Button type="button" onClick={() => setStep((s) => nextStep(s))} data-testid="ob-next">
                {t('common.actions.continue')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
