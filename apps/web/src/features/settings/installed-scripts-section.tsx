'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useInstalledEventScripts } from '@/features/events/use-installed-event-scripts';

/**
 * v2.11：来自能力包的剧本列表（只读；试演跳到对话页由导演执行）。
 * 停用的剧本不在列表中（导演侧同样不会再被短语触发）。
 */
export function InstalledScriptsSection() {
  const { t } = useI18n();
  const { data, isLoading } = useInstalledEventScripts(true);

  return (
    <div className="space-y-1.5" data-testid="installed-scripts-section">
      <div className="text-sm font-medium">{t('event.ui.installedTitle')}</div>
      <p className="text-xs text-muted-foreground">{t('event.ui.installedHint')}</p>
      {isLoading ? null : data && data.length > 0 ? (
        <ul className="space-y-1.5">
          {data.map((script) => (
            <li
              key={script.id}
              className="flex flex-wrap items-center gap-2 rounded-md border bg-background/60 p-2"
              data-testid={`installed-script-${script.id}`}
            >
              <span className="text-xs font-medium">{script.definition.title ?? script.id}</span>
              <Badge variant="outline" className="px-1.5 py-0">
                {t('capabilities.kind.event-script')}
              </Badge>
              {script.phrases.map((phrase) => (
                <Badge key={phrase} variant="info" className="px-1.5 py-0">
                  {phrase}
                </Badge>
              ))}
              <span className="text-[10px] text-muted-foreground">{script.packId}</span>
              <a
                href={`/chat?previewEvent=${encodeURIComponent(script.id)}`}
                className="ml-auto inline-flex h-7 items-center rounded-md border px-2 text-xs hover:bg-muted"
                data-testid={`installed-script-preview-${script.id}`}
              >
                {t('event.ui.installedPreview')}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t('event.ui.installedEmpty')}</p>
      )}
    </div>
  );
}
