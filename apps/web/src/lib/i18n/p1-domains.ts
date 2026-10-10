/**
 * v1.2 M4 T4.6：P1 未英文化域登记。
 * 策略：英文态访问这些域时界面保留中文（硬编码文案，不经过 t()），
 * 要求不崩、不裸露 a.b.c 风格键；后续版本逐个翻译后从此清单移除。
 * v1.3 M5：flow-editor / flow-execution / tool-debug / tool-trace / voice /
 * avatar / pet 七域已全部 t() 化并补齐英文，仅剩 Live2D 法律段刻意不译。
 */
export interface P1Domain {
  /** 组件路径（相对 apps/web/src） */
  path: string;
  /** 中文回退范围说明 */
  scope: string;
}

export const P1_UNTRANSLATED_DOMAINS: readonly P1Domain[] = [
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
