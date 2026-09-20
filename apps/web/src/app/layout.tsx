import type { Metadata } from 'next';
import { AppProviders } from './providers';
import { themeInitScript } from '@/components/theme/theme-provider';
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
      </head>
      <body className="min-h-screen">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
