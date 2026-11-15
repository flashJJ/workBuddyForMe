/** 桌宠 IPC 频道与默认值（v1.1 T2.3 从 pet-manager 抽出，定义零改动；preload 侧用同名字符面量） */
export const OPEN_CHANGED_CHANNEL = 'pet:open-changed';
export const PERFORMANCE_CHANNEL = 'pet:performance';
/** v3.0 P4：原位换模型（主进程 → 桌宠窗）与渲染层回执（桌宠窗 → 主进程） */
export const MODEL_CHANGED_CHANNEL = 'pet:model-changed';
export const MODEL_APPLIED_CHANNEL = 'pet:model-applied';
/** v3.0 M1：右键菜单快捷动作（静音 / 主动说话 / 场戏）主进程 → 桌宠窗 */
export const QUICK_ACTION_CHANNEL = 'pet:quick-action';
/** v3.0：桌宠窗上报静音/主动说话状态（右键菜单勾选态） */
export const COMPANION_SETTINGS_CHANNEL = 'pet:companion-settings';
/** 换模型回执等待上限：超时回退为「销毁重建窗口」旧路径 */
export const MODEL_CHANGE_TIMEOUT_MS = 1500;
/** 默认角色（与 web/voice schema 默认值一致） */
export const DEFAULT_MODEL = 'haru';
