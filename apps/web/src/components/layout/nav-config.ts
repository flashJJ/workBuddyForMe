import {
  MessageSquare,
  Library,
  Bot,
  Settings,
  MonitorCog,
  Users,
  Workflow,
  ClipboardList,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';

export interface NavItem {
  href: string;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  icon: LucideIcon;
}

/** 侧边栏模块导航（唯一事实源；文案走 i18n 键，组件内 t() 解析） */
export const NAV_ITEMS: NavItem[] = [
  {
    href: '/chat',
    labelKey: 'nav.chat.label',
    descriptionKey: 'nav.chat.description',
    icon: MessageSquare,
  },
  {
    href: '/tasks',
    labelKey: 'nav.tasks.label',
    descriptionKey: 'nav.tasks.description',
    icon: MonitorCog,
  },
  {
    href: '/reports',
    labelKey: 'nav.reports.label',
    descriptionKey: 'nav.reports.description',
    icon: ClipboardList,
  },
  {
    href: '/approvals',
    labelKey: 'nav.approvals.label',
    descriptionKey: 'nav.approvals.description',
    icon: ShieldAlert,
  },
  {
    href: '/meetings',
    labelKey: 'meeting.nav',
    descriptionKey: 'meeting.subtitle',
    icon: Users,
  },
  {
    href: '/flows',
    labelKey: 'nav.flows.label',
    descriptionKey: 'nav.flows.description',
    icon: Workflow,
  },
  {
    href: '/knowledge',
    labelKey: 'nav.knowledge.label',
    descriptionKey: 'nav.knowledge.description',
    icon: Library,
  },
  {
    href: '/assistants',
    labelKey: 'nav.assistants.label',
    descriptionKey: 'nav.assistants.description',
    icon: Bot,
  },
  {
    href: '/settings',
    labelKey: 'nav.settings.label',
    descriptionKey: 'nav.settings.description',
    icon: Settings,
  },
];
