/**
 * v2.11 外部代理设置字段（单独成文件，避免 domain.ts 超出单文件 300 行上限）。
 * 由 AppSettings 交叉引入；默认值见 core settings-service。
 */
export interface SubagentCliSettingsFields {
  /** 显式开启后才注册本地 CLI 提供方（缺省 false） */
  subagentCliEnabled?: boolean;
  /** 命令：绝对路径或 PATH 可解析的可执行文件（空串=未配置） */
  subagentCliCommand?: string;
  /** 参数数组（≤10 项，每项 ≤200 字符；不经过 shell） */
  subagentCliArgs?: string[];
  /** 单次运行超时（60s–30min，服务端钳制） */
  subagentCliTimeoutMs?: number;
  /** stdout 总量上限（64KB–8MB，服务端钳制） */
  subagentCliMaxOutputBytes?: number;
}
