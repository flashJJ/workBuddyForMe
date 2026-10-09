/**
 * @wbfm/shared 根 barrel（v1.1 M2 域子路径化）：
 * 只做各域 barrel / 叶契约的聚合，公开面与历史完全一致；新代码优先按域子路径导入：
 *   @wbfm/shared/schemas、@wbfm/shared/types、@wbfm/shared/errors、
 *   @wbfm/shared/api、@wbfm/shared/constants、@wbfm/shared/pet …
 * 根 barrel 在 v1.1 兼容期保留；各域导出名互斥，冲突在域 barrel 内解决。
 */
export * from './constants';
export * from './errors';
export * from './api';
export * from './types';
export * from './schemas';
export * from './backup';
export * from './updater';
export * from './pet';
export * from './command';
export * from './version';
