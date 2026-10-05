import {
  MessageSquare,
  Library,
  Bot,
  Settings,
  MonitorCog,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

/** 侧边栏模块导航（唯一事实源） */
export const NAV_ITEMS: NavItem[] = [
  { href: '/chat', label: '对话', icon: MessageSquare, description: '多会话流式 AI 对话' },
  { href: '/tasks', label: '任务', icon: MonitorCog, description: '桌面 Agent 任务循环与行动日志' },
  { href: '/flows', label: '工作流', icon: Workflow, description: '可视化流程编排与试运行' },
  { href: '/knowledge', label: '知识库', icon: Library, description: '文档管理与 RAG 问答' },
  { href: '/assistants', label: '助手', icon: Bot, description: '智能体与提示词预设' },
  { href: '/settings', label: '设置', icon: Settings, description: '供应商、模型与偏好' },
];
