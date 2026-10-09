import type { MessageKey } from '@wbfm/shared/i18n';

/**
 * 帮助中心 FAQ 条目顺序与锚点（v1.2 M5）。
 * 文案真源在 i18n help.items.*（中英双语 Markdown），此处仅登记 id→键映射，
 * 供面板渲染与错误提示锚点跳转共用。
 */
export interface HelpItem {
  /** URL hash 锚点，如 #provider；错误 toast「查看帮助」拼 /settings#{id} */
  id: string;
  questionKey: MessageKey;
  /** 答案为精简 Markdown（列表/行内代码/链接） */
  answerKey: MessageKey;
}

export const HELP_ITEMS: readonly HelpItem[] = [
  {
    id: 'first-steps',
    questionKey: 'help.items.firstSteps.q',
    answerKey: 'help.items.firstSteps.a',
  },
  {
    id: 'install',
    questionKey: 'help.items.install.q',
    answerKey: 'help.items.install.a',
  },
  {
    id: 'provider',
    questionKey: 'help.items.provider.q',
    answerKey: 'help.items.provider.a',
  },
  {
    id: 'ollama',
    questionKey: 'help.items.ollama.q',
    answerKey: 'help.items.ollama.a',
  },
  {
    id: 'models',
    questionKey: 'help.items.models.q',
    answerKey: 'help.items.models.a',
  },
  {
    id: 'voice',
    questionKey: 'help.items.voice.q',
    answerKey: 'help.items.voice.a',
  },
  {
    id: 'data',
    questionKey: 'help.items.data.q',
    answerKey: 'help.items.data.a',
  },
  {
    id: 'uninstall',
    questionKey: 'help.items.uninstall.q',
    answerKey: 'help.items.uninstall.a',
  },
  {
    id: 'shortcuts',
    questionKey: 'help.items.shortcuts.q',
    answerKey: 'help.items.shortcuts.a',
  },
  {
    id: 'update',
    questionKey: 'help.items.update.q',
    answerKey: 'help.items.update.a',
  },
];

/** 帮助中心在设置页内的锚点 id（关于面板「帮助与常见问题」跳转目标） */
export const HELP_CENTER_ANCHOR = 'help-center';

/** 拼跳转到设置页帮助中心指定 FAQ 的完整 hash 链接 */
export function helpLink(faqId?: string): string {
  return faqId ? `/settings#${faqId}` : `/settings#${HELP_CENTER_ANCHOR}`;
}
