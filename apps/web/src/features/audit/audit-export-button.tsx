'use client';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { downloadApiFile } from '@/lib/api/download';
import { API } from '@/lib/api/endpoints';

/**
 * v2.16：审计账本导出。
 * 桌面端 location.href 不带启动令牌会 401，改为带令牌的 fetch + Blob 落盘。
 */
export function AuditExportButton() {
  const { t } = useI18n();
  const toast = useToast();

  return (
    <Button
      size="sm"
      onClick={() => {
        void downloadApiFile(API.auditExport(), 'audit.jsonl').catch(() =>
          toast.error(t('audit.exportError')),
        );
      }}
    >
      {t('audit.export')}
    </Button>
  );
}
