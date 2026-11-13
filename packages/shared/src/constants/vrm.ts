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

/**
 * 内置 VRM（静态资源随安装包分发，不写用户数据目录）：
 * fileRef 走 `builtin:` 前缀，vrm-session 直接解析到对应 assetPath，不经 /api/vrm-avatars。
 */
export interface BuiltinVrmSpec {
  /** 内置 fileRef（`builtin:` 前缀） */
  fileRef: string;
  /** avatarModelId（`vrm:builtin:xxx`） */
  modelId: string;
  /** public 下的静态资源路径 */
  assetPath: string;
}

/** 鲸鱼娘-雪团（默认内置形象） */
export const BUILTIN_VRM_XUETUAN: BuiltinVrmSpec = {
  fileRef: 'builtin:xuetuan',
  modelId: 'vrm:builtin:xuetuan',
  assetPath: '/vrm/models/xuetuan.vrm',
};

/** 运动健将-冉卡露丽 */
export const BUILTIN_VRM_RANKALULI: BuiltinVrmSpec = {
  fileRef: 'builtin:rankaluli',
  modelId: 'vrm:builtin:rankaluli',
  assetPath: '/vrm/models/rankaluli.vrm',
};

/** 兔耳娘-菲比 */
export const BUILTIN_VRM_FEIBI: BuiltinVrmSpec = {
  fileRef: 'builtin:feibi',
  modelId: 'vrm:builtin:feibi',
  assetPath: '/vrm/models/feibi.vrm',
};

/** 内置 VRM 列表（设置选择器展示顺序） */
export const BUILTIN_VRM_MODELS: readonly BuiltinVrmSpec[] = [
  BUILTIN_VRM_XUETUAN,
  BUILTIN_VRM_RANKALULI,
  BUILTIN_VRM_FEIBI,
];

/** 默认内置模型（鲸鱼娘-雪团）：新用户默认形象与老逻辑继续沿用 */
export const BUILTIN_VRM_FILE_REF = BUILTIN_VRM_XUETUAN.fileRef;
export const BUILTIN_VRM_MODEL_ID = BUILTIN_VRM_XUETUAN.modelId;
export const BUILTIN_VRM_ASSET_PATH = BUILTIN_VRM_XUETUAN.assetPath;

/** 内置 fileRef → 静态资源路径；非内置返回 null */
export function resolveBuiltinVrmAsset(fileRef: string): string | null {
  return BUILTIN_VRM_MODELS.find((model) => model.fileRef === fileRef)?.assetPath ?? null;
}
