/**
 * i18n 框架类型（v1.2 M4，自研零运行时依赖）：
 * - 单一字典 + 点路径模块前缀（common.actions.save / settings.title …）
 * - zh-CN 字典是结构唯一真源，en-US 为 DeepPartial，缺键机械回退 zh-CN
 */

/** 消息字典：叶子恒为 string，中间节点为嵌套对象 */
export interface MessageNode {
  [key: string]: string | MessageNode;
}

/** t() 插值变量：仅支持字符串与数字（日期/百分比在调用前用 Intl 格式化） */
export type MessageVars = Record<string, string | number>;

/** ICU-lite 复数形式：本版只支持 one/other（中文恒 other，英文 n===1 为 one） */
export type PluralForm = 'one' | 'other';
export type PluralRule = (count: number) => PluralForm;

/** 缺键/缺变量等回退事件（dev warn、测试 fail 模式都挂这个回调） */
export type MissingReason = 'missingKey' | 'missingVar';
export interface MissingContext {
  key: string;
  varName?: string;
}

type DotJoin<K extends string | number, Prefix extends string> = Prefix extends ''
  ? `${K}`
  : `${Prefix}.${K}`;

/** 从字典结构机械推导全部「叶子为 string」的点路径联合类型 */
export type MessageKeyPaths<T, Prefix extends string = ''> = {
  [K in keyof T & (string | number)]: T[K] extends string
    ? DotJoin<K, Prefix>
    : T[K] extends MessageNode
      ? MessageKeyPaths<T[K], DotJoin<K, Prefix>>
      : never;
}[keyof T & (string | number)];

/** en-US 允许任意层级缺键，但不允许出现 zh-CN 中不存在的键 */
export type DeepPartialMessages<T> = {
  [K in keyof T]?: T[K] extends string
    ? string
    : T[K] extends MessageNode
      ? DeepPartialMessages<T[K]>
      : never;
};
