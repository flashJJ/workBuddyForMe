'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.4 P0-2（M2）· 统一模板卡区（纯展示）。
 * 卡面 = 名称 / 一句适用场景 / 来源徽标 / 「推荐先用」标记 / 主按钮「以此开始」；
 * 具体「以此开始」做什么由父级按类决定（复制 / 启用 / 预填）。
 */
export interface TemplateGalleryItem {
  id: string;
  name: string;
  description: string;
  /** 主按钮文案（如「以此开始」「启用」） */
  actionLabel: string;
  recommended?: boolean;
  disabled?: boolean;
}

export interface TemplateGalleryGroup {
  label?: string;
  items: TemplateGalleryItem[];
}

interface Props {
  groups: TemplateGalleryGroup[];
  onStart: (item: TemplateGalleryItem) => void;
  /** 单列紧凑模式（侧栏等窄容器） */
  compact?: boolean;
  /** 测试前缀；卡片 testid = `${testId}-card-${id}` */
  testId: string;
}

export function TemplateGallery({ groups, onStart, compact, testId }: Props) {
  const { t } = useI18n();
  const visible = groups.filter((group) => group.items.length > 0);
  return (
    <div className="space-y-3" data-testid={testId}>
      {visible.map((group, index) => (
        <div key={group.label ?? index} className="space-y-2">
          {group.label ? (
            <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
          ) : null}
          <ul className={cn('grid gap-2', !compact && 'sm:grid-cols-2 xl:grid-cols-3')}>
            {group.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1.5 rounded-md border p-2.5"
                data-testid={`${testId}-card-${item.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-medium">{item.name}</span>
                  <Badge variant="outline" className="shrink-0">
                    {t('templates.badge')}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
                  {item.recommended ? (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      {t('templates.recommended')}
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={item.disabled}
                    onClick={() => onStart(item)}
                  >
                    {item.actionLabel}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
