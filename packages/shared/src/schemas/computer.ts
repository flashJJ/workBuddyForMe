import { z } from 'zod';

/**
 * v0.7 M1 屏幕感知契约：desktop 主进程控制通道 + screen_snapshot 工具。
 * 通道发现文件由 desktop 写入数据根目录，core 侧读取后走 127.0.0.1 + bearer token 调用。
 */

/** 控制通道发现文件名（位于数据根目录） */
export const COMPUTER_CHANNEL_FILE = 'computer-channel.json';

/** 截图缩放后最大边长（控制视觉 token 成本） */
export const SCREENSHOT_MAX_EDGE = 1568;

export const SCREEN_SNAPSHOT_SCOPES = ['fullscreen', 'region'] as const;
export type ScreenSnapshotScope = (typeof SCREEN_SNAPSHOT_SCOPES)[number];

/** 截图区域：源显示器物理像素坐标（相对显示器原点），desktop 先裁剪后缩放 */
export const screenSnapshotRegionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});
export type ScreenSnapshotRegion = z.infer<typeof screenSnapshotRegionSchema>;

export const screenSnapshotArgsSchema = z
  .object({
    scope: z.enum(SCREEN_SNAPSHOT_SCOPES).default('fullscreen'),
    region: screenSnapshotRegionSchema.optional(),
  })
  .refine((v) => v.scope !== 'region' || v.region !== undefined, {
    message: 'scope=region 时必须提供 region',
    path: ['region'],
  });
export type ScreenSnapshotArgs = z.infer<typeof screenSnapshotArgsSchema>;

/** 控制通道发现文件内容（desktop 启动时写入，退出时删除） */
export interface ComputerChannelInfo {
  version: 1;
  url: string;
  token: string;
  pid: number;
  startedAt: string;
}

export const computerChannelInfoSchema = z.object({
  version: z.literal(1),
  url: z.string().url(),
  token: z.string().min(1),
  pid: z.number().int().positive(),
  startedAt: z.string().min(1),
});

/** 控制通道截图响应（已裁剪+缩放后的成品图） */
export interface ScreenSnapshotResponse {
  imageBase64: string;
  mimeType: 'image/png';
  /** 成品图尺寸（≤ SCREENSHOT_MAX_EDGE） */
  width: number;
  height: number;
  /** 截图源区域在显示器上的物理像素尺寸与原点（用于坐标换算回真实屏幕） */
  sourceWidth: number;
  sourceHeight: number;
  originX: number;
  originY: number;
  /** 缩放比 = 成品图边长 / 源区域边长（等比） */
  scaleFactor: number;
}
