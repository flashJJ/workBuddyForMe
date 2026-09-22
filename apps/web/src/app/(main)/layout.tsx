import { AppSidebar } from '@/components/layout/app-sidebar';
import { CommandPaletteHost } from '@/features/command-palette/use-command-palette';

/** 主工作区布局：侧边栏 + 内容区 + 命令面板（Ctrl+K） */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <CommandPaletteHost />
    </div>
  );
}
