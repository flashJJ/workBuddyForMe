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
import type { Command } from '@wbfm/shared/command';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useConversationMutations } from '@/lib/hooks/use-conversations';
import { useI18n } from '@/lib/i18n/use-i18n';
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
  const { t } = useI18n();

  return React.useMemo<Command[]>(() => {
    const firstAssistantId = assistants?.[0]?.id;
    const ck = 'commandPalette.commands';

    const commands: Command[] = [
      // ── 导航 ──
      {
        id: 'nav:chat',
        label: t(`${ck}.navChat.label`),
        description: t(`${ck}.navChat.description`),
        group: 'navigation',
        keywords: ['chat', '对话', '消息'],
        action: () => navigate('/chat'),
      },
      {
        id: 'nav:knowledge',
        label: t(`${ck}.navKnowledge.label`),
        description: t(`${ck}.navKnowledge.description`),
        group: 'navigation',
        keywords: ['knowledge', '知识库', '文档', 'rag'],
        action: () => navigate('/knowledge'),
      },
      {
        id: 'nav:assistants',
        label: t(`${ck}.navAssistants.label`),
        description: t(`${ck}.navAssistants.description`),
        group: 'navigation',
        keywords: ['assistant', '助手', '智能体'],
        action: () => navigate('/assistants'),
      },
      {
        id: 'nav:settings',
        label: t(`${ck}.navSettings.label`),
        description: t(`${ck}.navSettings.description`),
        group: 'navigation',
        keywords: ['settings', '设置', '配置'],
        action: () => navigate('/settings'),
      },

      // ── 会话 ──
      {
        id: 'conv:new',
        label: t(`${ck}.convNew.label`),
        description: firstAssistantId
          ? t(`${ck}.convNew.description`)
          : t(`${ck}.convNew.disabled`),
        group: 'conversation',
        keywords: ['new', '新建', '创建', '对话', 'conversation'],
        disabled: !firstAssistantId,
        action: async () => {
          if (!firstAssistantId) return;
          try {
            const conv = await conversationMutations.create.mutateAsync({
              assistantId: firstAssistantId,
              title: t('chat.newConversationTitle'),
            });
            navigate(`/chat`);
            toast.success(t('toast.conversationCreated', { title: conv.title }));
          } catch {
            toast.error(t('toast.conversationCreateFailed'));
          }
        },
      },
      {
        id: 'conv:search',
        label: t(`${ck}.convSearch.label`),
        description: t(`${ck}.convSearch.description`),
        group: 'conversation',
        keywords: ['search', '搜索', '历史', '对话', 'history'],
        action: () => navigate('/chat'),
      },
      {
        id: 'conv:export',
        label: t(`${ck}.convExport.label`),
        description: t(`${ck}.convExport.description`),
        group: 'conversation',
        keywords: ['export', 'share', '导出', '分享'],
        action: () => {
          navigate('/chat');
          toast.info(t(`${ck}.convExportHint`));
        },
      },

      // ── 助手 ──
      {
        id: 'asst:switch',
        label: t(`${ck}.asstSwitch.label`),
        description: t(`${ck}.asstSwitch.description`),
        group: 'assistant',
        keywords: ['switch', '切换', '助手'],
        action: () => navigate('/assistants'),
      },

      // ── 设置 ──
      {
        id: 'set:providers',
        label: t(`${ck}.setProviders.label`),
        description: t(`${ck}.setProviders.description`),
        group: 'settings',
        keywords: ['provider', '供应商', '模型', 'api'],
        action: () => navigate('/settings'),
      },
      {
        id: 'set:theme',
        label: t(`${ck}.setTheme.label`),
        description: t(`${ck}.setTheme.description`),
        group: 'settings',
        keywords: ['theme', '主题', '深色', '浅色', 'dark', 'light'],
        action: () => navigate('/settings'),
      },

      // ── 更新 ──
      {
        id: 'upd:check',
        label: t(`${ck}.updCheck.label`),
        description: t(`${ck}.updCheck.description`),
        group: 'update',
        keywords: ['update', '检查', '更新', '版本'],
        action: () => navigate('/settings'),
      },
    ];

    return commands;
  }, [assistants, conversationMutations, navigate, close, toast, t]);
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
