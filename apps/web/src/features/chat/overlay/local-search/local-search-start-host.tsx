'use client';

import * as React from 'react';
import type { ChatSession } from '../../types/chat-session.types';
import { useI18n } from '@/lib/i18n/use-i18n';
import { LocalSearchStartDialog } from './local-search-start-dialog';

/**
 * v4.16：本地搜索启动询问的宿主：持有失败文案，避免把状态塞进对话页主组件。
 */
export function LocalSearchStartHost({ state }: { state: ChatSession['localSearchStart'] }) {
  const { t } = useI18n();
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setError(null);
  }, [state.pending?.callId]);

  const start = async () => {
    setError(null);
    const result = await state.start();
    if (result.ok) return;
    setError(result.reason === 'confirm_timeout' ? t('toast.toolConfirmSubmitFailed') : result.error ?? null);
  };

  return (
    <LocalSearchStartDialog
      open={Boolean(state.pending)}
      endpoint={state.pending?.endpoint ?? ''}
      query={state.pending?.query ?? ''}
      canAutoStart={state.canAutoStart}
      running={state.running}
      error={error}
      onStart={() => void start()}
      onCancel={() => {
        setError(null);
        void state.cancel();
      }}
    />
  );
}
