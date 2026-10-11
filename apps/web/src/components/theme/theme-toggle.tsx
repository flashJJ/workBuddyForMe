'use client';

import { Moon, Sun } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useTheme } from './theme-provider';

/** 深/浅主题切换按钮，状态来自 ThemeProvider（system 态按实际生效值显示与切换） */
export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? t('nav.theme.switchToLight') : t('nav.theme.switchToDark')}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
