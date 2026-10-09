import { AppSidebar } from '@/components/layout/app-sidebar';
import { SkipLink } from '@/components/layout/skip-link';
import { CommandPaletteHost } from '@/features/command-palette/use-command-palette';

/** 主工作区布局：侧边栏 + 内容区 + 命令面板（Ctrl+K） */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* 键盘用户首站：视觉隐藏，聚焦时显现 */}
      <SkipLink />
      <AppSidebar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto outline-none">
        {children}
      </main>
      <CommandPaletteHost />
    </div>
  );
}
