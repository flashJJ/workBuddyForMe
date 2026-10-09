import type { Metadata } from 'next';
import { AppProviders } from './providers';
import { themeInitScript } from '@/components/theme/theme-provider';
import { languageInitScript } from '@/lib/i18n/i18n-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'WorkBuddy For Me',
  description: '类 WorkBuddy 的私人 AI 平台：多模型对话、知识库 RAG 与助手预设',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: languageInitScript }} />
        {/* M4 桌宠窗：/pet 独立透明路由，head 阻塞阶段先打标（避免首帧刷不透明底色），
            CSS 据 data-pet 强制 html/body 透明；桌宠是独立 BrowserWindow，无路由跳转 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if(typeof location!=='undefined'&&location.pathname.indexOf('/pet')===0){document.documentElement.dataset.pet='1';}",
          }}
        />
      </head>
      <body className="min-h-screen">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
