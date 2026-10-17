/**
 * v2.0 待机动作（VRMA）常量
 * VRM 模型本体不含 AnimationClip（静止姿态是规范要求的 T-pose），需外部 VRMA 待机动作。
 */

/** VRMA 文件体积上限（10MB） */
export const MOTION_MAX_BYTES = 10 * 1024 * 1024;

/** 数据目录下待机动作存储子目录名 */
export const MOTIONS_DIR = 'motions';

/** idleMotionId 前缀：motion:<fileRef> 表示用户导入的动作 */
export const MOTION_PREFIX = 'motion:';

/** VRMA 扩展名（仅 .vrma） */
export const MOTION_FILE_EXT = '.vrma';

/** 内置默认待机动作（自制素材，随包捆绑，开箱即用） */
export const BUILTIN_IDLE_MOTION_URL = '/motions/daiji.vrma';
export const BUILTIN_IDLE_MOTION_ID = 'builtin:daiji';
export const BUILTIN_IDLE_MOTION_NAME = '内置 · 待机（daiji）';

/** 待机动作自动轮播：默认间隔与可调范围（秒） */
export const MOTION_ROTATION_SECONDS_DEFAULT = 8;
export const MOTION_ROTATION_SECONDS_MIN = 3;
export const MOTION_ROTATION_SECONDS_MAX = 60;
