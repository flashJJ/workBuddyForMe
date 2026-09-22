'use client';

import * as React from 'react';
import {
  MessageSquarePlus,
  Bot,
  Library,
  Settings,
  Download,
  RefreshCw,
  Search,
  type LucideIcon,
} from 'lucide-react';
import type { Command } from '@wbfm/shared';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useConversationMutations } from '@/lib/hooks/use-conversations';
import { useToast } from '@/components/common/toast';

interface UseCommandsOptions {
  navigate: (href: string) => void;
  close: () => void;
}

/**
 * 内置命令注册（M5）。
 * 依赖助手列表（新建会话需要 assistantId）与会话创建 mutation。
 * 命令按 group 分组：navigation / conversation / assistant / settings / update。
 */
export function useCommands({ navigate, close }: UseCommandsOptions): Command[] {
  const { data: assistants } = useAssistants();
  const conversationMutations = useConversationMutations();
  const toast = useToast();

  return React.useMemo<Command[]>(() => {
    const firstAssistantId = assistants?.[0]?.id;

    const commands: Command[] = [
      // ── 导航 ──
      {
        id: 'nav:chat',
        label: '前往对话',
        description: '进入对话页面',
        group: 'navigation',
        keywords: ['chat', '对话', '消息'],
        action: () => navigate('/chat'),
      },
      {
        id: 'nav:knowledge',
        label: '前往知识库',
        description: '管理文档与 RAG',
        group: 'navigation',
        keywords: ['knowledge', '知识库', '文档', 'rag'],
        action: () => navigate('/knowledge'),
      },
      {
        id: 'nav:assistants',
        label: '前往助手',
        description: '智能体与提示词预设',
        group: 'navigation',
        keywords: ['assistant', '助手', '智能体'],
        action: () => navigate('/assistants'),
      },
      {
        id: 'nav:settings',
        label: '前往设置',
        description: '供应商、模型与偏好',
        group: 'navigation',
        keywords: ['settings', '设置', '配置'],
        action: () => navigate('/settings'),
      },

      // ── 会话 ──
      {
        id: 'conv:new',
        label: '新建会话',
        description: firstAssistantId ? '在当前助手下创建新对话' : '暂无可用助手',
        group: 'conversation',
        keywords: ['new', '新建', '创建', '对话'],
        disabled: !firstAssistantId,
        action: async () => {
          if (!firstAssistantId) return;
          try {
            const conv = await conversationMutations.create.mutateAsync({
              assistantId: firstAssistantId,
              title: '新对话',
            });
            navigate(`/chat`);
            toast.success(`已创建会话：${conv.title}`);
          } catch {
            toast.error('创建会话失败');
          }
        },
      },
      {
        id: 'conv:search',
        label: '搜索会话',
        description: '按标题查找历史对话',
        group: 'conversation',
        keywords: ['search', '搜索', '历史', '对话'],
        action: () => navigate('/chat'),
      },
      {
        id: 'conv:export',
        label: '导出当前会话',
        description: '导出为 Markdown / HTML 快照',
        group: 'conversation',
        keywords: ['export', 'share', '导出', '分享'],
        action: () => {
          navigate('/chat');
          toast.info('请在对话页点击右上角「分享」按钮导出');
        },
      },

      // ── 助手 ──
      {
        id: 'asst:switch',
        label: '切换助手',
        description: '选择不同的智能体',
        group: 'assistant',
        keywords: ['switch', '切换', '助手'],
        action: () => navigate('/assistants'),
      },

      // ── 设置 ──
      {
        id: 'set:providers',
        label: '管理模型供应商',
        description: '新增 / 编辑 API 供应商',
        group: 'settings',
        keywords: ['provider', '供应商', '模型', 'api'],
        action: () => navigate('/settings'),
      },
      {
        id: 'set:theme',
        label: '切换主题',
        description: '深色 / 浅色模式',
        group: 'settings',
        keywords: ['theme', '主题', '深色', '浅色'],
        action: () => navigate('/settings'),
      },

      // ── 更新 ──
      {
        id: 'upd:check',
        label: '检查更新',
        description: '查看是否有新版本可用',
        group: 'update',
        keywords: ['update', '检查', '更新', '版本'],
        action: () => navigate('/settings'),
      },
    ];

    return commands;
  }, [assistants, conversationMutations, navigate, close, toast]);
}

/** 命令图标映射（按 id 取，用于面板渲染） */
export const COMMAND_ICONS: Record<string, LucideIcon> = {
  'nav:chat': MessageSquarePlus,
  'nav:knowledge': Library,
  'nav:assistants': Bot,
  'nav:settings': Settings,
  'conv:new': MessageSquarePlus,
  'conv:search': Search,
  'conv:export': Download,
  'asst:switch': Bot,
  'set:providers': Settings,
  'set:theme': Settings,
  'upd:check': RefreshCw,
};
