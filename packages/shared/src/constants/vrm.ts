/**
 * v2.0 M4 VRM 形象常量
 * 文件存储与导入上限（与 02 报告 §3.4 / 06 复核报告同口径）
 */

/** VRM 文件体积上限（60MB） */
export const VRM_MAX_BYTES = 60 * 1024 * 1024;

/** 数据目录下 VRM 存储子目录名 */
export const VRM_AVATARS_DIR = 'vrm-avatars';

/** avatarModelId 前缀：vrm:<fileRef> 区分内置 Live2D id */
export const VRM_AVATAR_PREFIX = 'vrm:';

/** VRM 扩展名（仅 .vrm，不收 .glb/.gltf） */
export const VRM_FILE_EXT = '.vrm';
