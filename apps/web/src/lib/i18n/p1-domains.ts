/**
 * v1.2 M4 T4.6：P1 未英文化域登记。
 * 策略：英文态访问这些域时界面保留中文（硬编码文案，不经过 t()），
 * 要求不崩、不裸露 a.b.c 风格键；后续版本逐个翻译后从此清单移除。
 */
export interface P1Domain {
  /** 组件路径（相对 apps/web/src） */
  path: string;
  /** 中文回退范围说明 */
  scope: string;
}

export const P1_UNTRANSLATED_DOMAINS: readonly P1Domain[] = [
  { path: 'features/flow-editor/**', scope: '流程画布：节点/连线/端点配置等画布细节' },
  { path: 'features/flow-execution/**', scope: '运行时执行面板/时间线/人工等待卡的开发者向文案' },
  { path: 'features/settings/tool-debug-panel.tsx', scope: '工具调试台技术文案与原始 JSON' },
  { path: 'features/chat/tool-trace.tsx', scope: '消息内工具调用徽章的开发者向技术名' },
  { path: 'features/voice/**', scope: '语音高级面板、TTS/ASR 参数、麦克风自测' },
  { path: 'features/avatar/**', scope: 'Live2D 形象控件与表情' },
  { path: 'features/pet/**', scope: '桌宠独立窗文案' },
  {
    path: 'features/settings/about-panel.tsx (Live2D 许可段)',
    scope: '第三方许可法律文本（随附官方英文版，刻意不译）',
  },
];

/**
 * strict 缺键扫描的豁免键前缀。
 * P1 域当前全部为硬编码中文（没有 t() 键），故为空；
 * 当某个 P1 域开始 t() 化但英文尚未补齐时，在此登记其顶层 namespace
 * （如 'flowEditor'），翻译补齐后移除。
 */
export const P1_ALLOWED_MISSING_PREFIXES: readonly string[] = [];
