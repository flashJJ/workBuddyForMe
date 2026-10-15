/**
 * v1.7 剧情事件的设置字段（挂 AppSettings，持久化于 settings_kv，无 DB 迁移）。
 */
import type { EventFrequencyTier } from '../schemas/event';

export interface EventSettingsFields {
  /** 剧情事件总开关（缺省视为 true；勿扰/对话锁/出口仍由导演层兜底） */
  eventsEnabled?: boolean;
  /** 主动频率档（冷却系数 1.5/1/0.6；缺省 standard） */
  eventFrequencyTier?: EventFrequencyTier;
  /** 被停用的内置剧本 id 列表（缺省空=全部启用） */
  disabledEventIds?: string[];
  /**
   * v2.0 M3 系统事件感知授权（解锁/锁屏/系统空闲计时；缺省 false，须用户显式开启）。
   * 关闭时上下文触发器回落为应用内活动口径；原始信号不落盘。
   */
  systemEventAwarenessEnabled?: boolean;
}
