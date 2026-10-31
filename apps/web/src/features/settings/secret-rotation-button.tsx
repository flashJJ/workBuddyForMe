'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import type { SecretRotationResult } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/components/common/toast';
import { ApiClientError, apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v2.15：设置 → 关于（安全区块）的 Provider 凭证轮换入口 */
export function SecretRotationButton() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const rotate = async () => {
    if (pending) return;
    if (
      !(await confirm({
        title: t('about.secretRotationTitle'),
        description: t('about.secretRotationConfirm'),
        confirmText: t('about.secretRotationConfirmButton'),
        danger: true,
      }))
    ) {
      return;
    }
    setPending(true);
    try {
      const result = await apiPost<SecretRotationResult>(API.secretRotate);
      const message = t('about.secretRotationDone', {
        rotated: String(result.rotated),
        skipped: String(result.skipped),
        failed: String(result.failed),
      });
      if (result.failed > 0) toast.error(message);
      else if (result.skipped > 0) toast.info(message);
      else toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : t('about.secretRotationFailed'),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-1" data-testid="secret-rotation-block">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => void rotate()}
        data-testid="secret-rotation"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {pending ? t('about.secretRotationPending') : t('about.secretRotation')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('about.secretRotationHint')}</p>
    </div>
  );
}
