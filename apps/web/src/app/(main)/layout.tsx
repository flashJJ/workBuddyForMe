import { AppSidebar } from '@/components/layout/app-sidebar';

/** 主工作区布局：侧边栏 + 内容区 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
