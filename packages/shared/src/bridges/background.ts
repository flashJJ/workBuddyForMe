/**
 * v4.4 M2：桌面背景文件桥。
 *
 * 主进程只暴露三个白名单动作：选择并复制、列出、删除；
 * 返回 id 与元数据，不向渲染层暴露真实路径。
 */

export const BACKGROUND_FILE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'mp4'] as const;
export type BackgroundFileExt = (typeof BACKGROUND_FILE_EXTS)[number];

export type BackgroundFileKind = 'image' | 'video';

export interface WbfmBackgroundFile {
  /** uuid + 扩展名，作为 userData/backgrounds 下的文件名 */
  id: string;
  kind: BackgroundFileKind;
  /** 用户原始文件名，仅用于展示 */
  name: string;
  bytes: number;
}

export type BackgroundPickFailure = 'too-large' | 'unsupported' | 'copy-failed';

export interface WbfmBackgroundPickResult {
  canceled: boolean;
  file?: WbfmBackgroundFile;
  /** 选择成功但复制失败时的原因 */
  reason?: BackgroundPickFailure;
}

export interface WbfmBackgroundBridge {
  /** 打开系统文件选择；成功后复制到受控目录 */
  pick(): Promise<WbfmBackgroundPickResult>;
  /** 列出已复制背景 */
  list(): Promise<WbfmBackgroundFile[]>;
  /** 删除指定 id 的副本；不存在时返回 false */
  remove(id: string): Promise<boolean>;
}

/** 受控文件名：uuid + 白名单扩展名（主进程写入、Web 只读同一规则） */
export const BACKGROUND_FILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|mp4)$/i;

export const BACKGROUND_FILE_KIND_BY_EXT: Readonly<Record<string, BackgroundFileKind>> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  mp4: 'video',
};

export function isBackgroundFileId(id: string): boolean {
  return BACKGROUND_FILE_ID_PATTERN.test(id);
}

export function backgroundFileKind(id: string): BackgroundFileKind | null {
  if (!isBackgroundFileId(id)) return null;
  const ext = id.slice(id.lastIndexOf('.') + 1).toLowerCase();
  return BACKGROUND_FILE_KIND_BY_EXT[ext] ?? null;
}
