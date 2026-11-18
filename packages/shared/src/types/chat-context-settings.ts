/**
 * v4.8：对话上下文智能调控设置字段（单独成文件，避免 domain.ts 超行）。
 * 默认值见 core settings-service。
 */
export interface ChatContextSettingsFields {
  /** 装配前预判压缩（历史超 85% 水位先压缩；缺省 true） */
  contextPreflightCompactEnabled?: boolean;
  /** 小模型意图识别（缺省 false；关闭时纯规则零额外调用） */
  intentClassifierEnabled?: boolean;
  /** 意图识别模型（null=跟随默认对话模型） */
  intentClassifierModelId?: string | null;
}
