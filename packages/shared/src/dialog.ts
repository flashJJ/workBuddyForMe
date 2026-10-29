/** v2.11：桌面目录选择桥（外部代理 cwd 选择；纯浏览器环境为 undefined） */
export interface WbfmDialogBridge {
  /** 打开系统目录选择框；取消返回 null */
  pickDirectory(): Promise<string | null>;
}
