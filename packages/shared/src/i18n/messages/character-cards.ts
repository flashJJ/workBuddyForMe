/** v1.8 角色卡库词条（中文 + English；键集合与 en-coverage 校验保持一致） */

export const zhCharacterCards = {
  title: '角色卡库',
  description: '用 Markdown 定义助手的身份、性格、说话风格与边界；换卡立即生效。',
  trustNotice:
    '卡片内容会作为指令直接发给模型，请只导入你信任的卡。卡片是纯文本，禁止夹带 Live2D 模型、动作或音频等任何资产，本应用也不会读取这类内容。',
  create: '新建卡',
  importMd: '导入 .md',
  builtinBadge: '内置',
  customBadge: '自建',
  sectionBuiltin: '内置卡（只读，可复制为自建卡再编辑）',
  sectionCustom: '我的自建卡',
  duplicate: '复制为自建卡',
  exportMd: '导出 .md',
  edit: '编辑',
  delete: '删除',
  deleteConfirm: '删除角色卡「{name}」？正在使用这张卡的助手将回到默认卡。',
  emptyCustom: '还没有自建卡，可以新建一张，或把内置卡「复制为自建卡」。',
  loadError: '角色卡加载失败',
  editor: {
    createTitle: '新建角色卡',
    editTitle: '编辑角色卡',
    description: '粘贴或编写 Markdown：frontmatter 写 name/description/defaultEmotion，正文用「## 我是谁 / 性格特征 / 说话风格 / 边界」分节。',
    mdLabel: '卡片原文（Markdown）',
    formatHint: '仅支持纯文本标量 frontmatter；单文件 ≤16KB，列表最多 8 条、每条 ≤40 字。',
    save: '保存',
    saving: '保存中…',
    parseErrorTitle: '解析失败，请按诊断修改后再保存：',
    line: '第 {line} 行',
  },
  toast: {
    created: '角色卡已创建',
    imported: '角色卡已导入',
    updated: '角色卡已更新',
    duplicated: '已复制为自建卡',
    deleted: '角色卡已删除',
    importFailed: '导入失败',
    exportFailed: '导出失败',
  },
};

export const enCharacterCards = {
  title: 'Character cards',
  description:
    'Define an assistant’s identity, traits, speaking style and boundaries in Markdown. Switching cards takes effect immediately.',
  trustNotice:
    'Card content is sent to the model as instructions — only import cards you trust. Cards are plain text. Embedding Live2D models, motions, audio or any other assets is prohibited and never read by this app.',
  create: 'New card',
  importMd: 'Import .md',
  builtinBadge: 'Built-in',
  customBadge: 'Custom',
  sectionBuiltin: 'Built-in cards (read-only; duplicate to customize)',
  sectionCustom: 'My custom cards',
  duplicate: 'Duplicate as custom',
  exportMd: 'Export .md',
  edit: 'Edit',
  delete: 'Delete',
  deleteConfirm:
    'Delete character card “{name}”? Assistants using this card will fall back to the default card.',
  emptyCustom: 'No custom cards yet. Create one, or duplicate a built-in card to customize.',
  loadError: 'Failed to load character cards',
  editor: {
    createTitle: 'New character card',
    editTitle: 'Edit character card',
    description:
      'Paste or write Markdown: scalar frontmatter (name/description/defaultEmotion) plus “## Identity / Traits / Speaking style / Boundaries” sections.',
    mdLabel: 'Card source (Markdown)',
    formatHint:
      'Scalar frontmatter only; up to 16KB per file, up to 8 bullet items per list, 40 chars each.',
    save: 'Save',
    saving: 'Saving…',
    parseErrorTitle: 'Parsing failed. Fix the diagnostics and try again:',
    line: 'Line {line}',
  },
  toast: {
    created: 'Character card created',
    imported: 'Character card imported',
    updated: 'Character card updated',
    duplicated: 'Duplicated as a custom card',
    deleted: 'Character card deleted',
    importFailed: 'Import failed',
    exportFailed: 'Export failed',
  },
};
