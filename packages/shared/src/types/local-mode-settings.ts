/**
 * v2.4 M1 新增设置字段（单独成文件，避免 domain.ts 超出单文件 300 行上限）。
 * 由 AppSettings 交叉引入；语义与写入口径见各字段注释。
 */
export interface LocalModeSettingsFields {
  /**
   * v2.4 M1：演示模式开关（缺省 false）。
   * 开启后内置 `demo` 供应商与 mock 模型，不填 Key 即可对话；关闭时清理该供应商与模型。
   */
  demoModeEnabled?: boolean;
  /**
   * v2.4 M1 T7：本地 TTFV 里程碑（epoch 毫秒，仅时间戳、不含任何对话内容）。
   * 记录点：首次启动（读设置）/ 模型就绪（建供应商）/ 首次完整回答；首写优先。
   */
  firstLaunchAt?: number | null;
  firstModelReadyAt?: number | null;
  firstAnswerAt?: number | null;
  /** 首次启动 → 首次回答的用时（毫秒；两个时间戳齐备时补算） */
  ttfvMs?: number | null;
}
