import {
  screenSnapshotArgsSchema,
  type ScreenSnapshotResponse,
} from '@wbfm/shared';
import type { ComputerChannelClient } from '../../computer/channel-client';
import { ChannelUnavailableError, createComputerChannelClient } from '../../computer/channel-client';
import type { Tool, ToolResult } from '../types';
import { ToolArgError } from '../types';

/**
 * v0.7 M1 屏幕感知工具：经 desktop 控制通道截取屏幕，供视觉模型解读。
 * 纯 Web 模式（无桌面端）返回 ok:true 的降级说明——属环境缺失而非工具失败，
 * 避免熔断器误计失败次数。
 */
export function createScreenSnapshotTool(client: ComputerChannelClient): Tool {
  return {
    name: 'screen_snapshot',
    description:
      '截取当前电脑屏幕（全屏或指定区域），返回截图供视觉模型解读。适用于「看看我屏幕上是什么」「解读这个报错界面」等需要观察桌面的请求。仅桌面端运行时可用。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['fullscreen', 'region'],
          description: '截图范围：fullscreen 全屏（默认），region 指定区域',
        },
        region: {
          type: 'object',
          description: 'scope=region 时必填，源显示器物理像素坐标（相对显示器左上角）',
          properties: {
            x: { type: 'integer', minimum: 0 },
            y: { type: 'integer', minimum: 0 },
            width: { type: 'integer', minimum: 1 },
            height: { type: 'integer', minimum: 1 },
          },
          required: ['x', 'y', 'width', 'height'],
        },
      },
      additionalProperties: false,
    },

    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = screenSnapshotArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        throw new ToolArgError(parsed.error.issues.map((i) => i.message).join('；'));
      }

      let snapshot: ScreenSnapshotResponse;
      try {
        snapshot = await client.snapshot(parsed.data, ctx.signal);
      } catch (error) {
        if (error instanceof ChannelUnavailableError) {
          return {
            ok: true,
            output:
              '当前为纯 Web 模式（无桌面端运行）或桌面端控制通道未就绪，屏幕截图不可用。请告知用户：屏幕感知能力仅在桌面端运行时提供。',
            summary: '屏幕截图不可用（纯 Web 模式）',
          };
        }
        throw error;
      }

      const meta =
        `已截取屏幕：成品 ${snapshot.width}x${snapshot.height}` +
        `（源区域 ${snapshot.sourceWidth}x${snapshot.sourceHeight}` +
        `，原点 (${snapshot.originX}, ${snapshot.originY})` +
        `，缩放比 ${snapshot.scaleFactor.toFixed(3)}）。` +
        '坐标换算：真实屏幕物理坐标 = 原点 + 图内坐标 / 缩放比。';

      if (!ctx.visionCapable) {
        return {
          ok: true,
          output: `${meta}\n注意：当前模型不具备视觉能力，无法解读截图内容。请建议用户切换到视觉模型（如 qwen2.5vl）后重试。截图已保存为附件。`,
          summary: `截图 ${snapshot.width}x${snapshot.height}（当前模型无视觉能力）`,
        };
      }

      return {
        ok: true,
        output: `${meta}\n截图已作为图片注入本轮对话，请直接解读其内容。`,
        summary: `截图 ${snapshot.width}x${snapshot.height}`,
        images: [{ mimeType: snapshot.mimeType, dataBase64: snapshot.imageBase64 }],
      };
    },
  };
}

/** 默认实例：按数据根发现文件定位控制通道（生产路径） */
export const screenSnapshotTool = createScreenSnapshotTool(createComputerChannelClient());
