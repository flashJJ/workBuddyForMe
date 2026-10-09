'use client';

import { MarkdownContent } from '@/features/chat/markdown';
import { useI18n } from '@/lib/i18n/use-i18n';
import { HELP_CENTER_ANCHOR, HELP_ITEMS } from './help-items';

/**
 * 帮助中心（v1.2 M5）：设置页内 FAQ 子区，内置静态 Markdown 问答。
 * - 顶部锚点 #help-center（关于面板入口）
 * - 每条 FAQ 自带 #<id> 锚点，错误 toast 的「查看帮助」可直达
 */
export function HelpCenterPanel() {
  const { t } = useI18n();

  return (
    <section
      id={HELP_CENTER_ANCHOR}
      data-testid="help-center"
      className="space-y-4 rounded-lg border bg-card p-4 scroll-mt-6"
    >
      <div className="space-y-1">
        <h3 className="font-medium">{t('help.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('help.description')}</p>
      </div>

      <nav aria-label={t('help.title')}>
        <ul className="flex flex-wrap gap-1.5">
          {HELP_ITEMS.map((item, index) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {index + 1}. {t(item.questionKey)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-4">
        {HELP_ITEMS.map((item) => (
          <article
            key={item.id}
            id={item.id}
            data-testid={`help-item-${item.id}`}
            className="space-y-1.5 border-t pt-3 scroll-mt-6"
          >
            <h4 className="text-sm font-medium">{t(item.questionKey)}</h4>
            <MarkdownContent content={t(item.answerKey)} />
          </article>
        ))}
      </div>
    </section>
  );
}
