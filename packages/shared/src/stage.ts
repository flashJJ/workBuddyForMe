/**
 * 舞台窗（v1.9）主进程 ↔ 渲染进程契约。
 *
 * 与桌宠同构（见 ./pet.ts 架构要点）：
 * - 队列所有方在主会话，舞台窗只是显示器，关窗不退协作/会议；
 * - 舞台不建音频管线，本桥也不含音频通道（语音走主窗既有 pet/voice 中继）；
 * - 仅 open/close/isOpen/截图/开关订阅，无文件系统能力（截图保存路径由主进程对话框决定）。
 */

/** 无 UI 截图结果（Electron capturePage → 保存对话框） */
export interface StageCaptureResult {
  saved: boolean;
  /** 用户在保存对话框取消 */
  canceled?: boolean;
}

/** preload 通过 contextBridge 暴露的舞台桥（window.wbfm.stage） */
export interface WbfmStageBridge {
  /** 主窗：打开全屏舞台（幂等；与桌宠互斥由主进程保证）；返回当前是否打开 */
  open(): Promise<boolean>;
  /** 舞台窗：关闭自己（幂等），协作/会议在主会话继续 */
  close(): Promise<void>;
  isOpen(): Promise<boolean>;
  /**
   * 舞台窗：截一张当前无 UI 的全屏图：主进程先隐藏窗口内 UI 层（经事件要求），
   * 再 capturePage 并弹保存对话框（PNG）。浏览器裸访无此桥。
   */
  capture(): Promise<StageCaptureResult>;
  /** 主窗/舞台窗：订阅舞台开关状态，返回取消订阅 */
  onOpenChange(cb: (open: boolean) => void): () => void;
}
