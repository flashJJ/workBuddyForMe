import { describe, expect, it } from 'vitest';
import type { ScreenSnapshotResponse } from '@wbfm/shared/schemas';
import { ChannelUnavailableError, type ComputerChannelClient } from '../../computer/channel-client';
import { createScreenSnapshotTool } from './screen-snapshot-tool';
import type { ToolContext } from '../types';

const SNAP: ScreenSnapshotResponse = {
  imageBase64: Buffer.from('png').toString('base64'),
  mimeType: 'image/png',
  width: 1568,
  height: 882,
  sourceWidth: 3840,
  sourceHeight: 2160,
  originX: 0,
  originY: 0,
  scaleFactor: 0.408,
};

function makeCtx(visionCapable: boolean): ToolContext {
  return { knowledgeBaseId: null, retrieve: async () => [], visionCapable };
}

function clientWith(run: ComputerChannelClient['snapshot']): ComputerChannelClient {
  const unavailable = () => Promise.reject(new ChannelUnavailableError('stub'));
  return {
    getInfo: () => null,
    snapshot: run,
    mouseMove: unavailable,
    mouseClick: unavailable,
    mouseScroll: unavailable,
    keyboardType: unavailable,
    keyboardPress: unavailable,
    windowList: unavailable,
    windowFocus: unavailable,
    appLaunch: unavailable,
    uiaList: unavailable,
  };
}

describe('screen_snapshot 工具', () => {
  it('参数非法抛 ToolArgError（scope=region 缺 region）', async () => {
    const tool = createScreenSnapshotTool(clientWith(async () => SNAP));
    await expect(tool.run({ scope: 'region' }, makeCtx(true))).rejects.toThrow(/region/);
  });

  it('通道不可用返回 ok:true 降级说明（不计熔断失败）', async () => {
    const tool = createScreenSnapshotTool(
      clientWith(async () => {
        throw new ChannelUnavailableError('无发现文件');
      }),
    );
    const result = await tool.run({ scope: 'fullscreen' }, makeCtx(true));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('纯 Web 模式');
    expect(result.images).toBeUndefined();
  });

  it('视觉模型轮次：成功返回图片与坐标换算说明', async () => {
    const tool = createScreenSnapshotTool(clientWith(async () => SNAP));
    const result = await tool.run({ scope: 'fullscreen' }, makeCtx(true));
    expect(result.ok).toBe(true);
    expect(result.images).toEqual([{ mimeType: 'image/png', dataBase64: SNAP.imageBase64 }]);
    expect(result.output).toContain('1568x882');
    expect(result.output).toContain('坐标换算');
  });

  it('非视觉模型轮次：不携带图片，提示切换视觉模型', async () => {
    const tool = createScreenSnapshotTool(clientWith(async () => SNAP));
    const result = await tool.run({ scope: 'fullscreen' }, makeCtx(false));
    expect(result.ok).toBe(true);
    expect(result.images).toBeUndefined();
    expect(result.output).toContain('不具备视觉能力');
  });

  it('region 截图透传参数给通道', async () => {
    let seen: unknown = null;
    const tool = createScreenSnapshotTool(
      clientWith(async (args) => {
        seen = args;
        return SNAP;
      }),
    );
    await tool.run({ scope: 'region', region: { x: 10, y: 20, width: 300, height: 200 } }, makeCtx(true));
    expect(seen).toEqual({ scope: 'region', region: { x: 10, y: 20, width: 300, height: 200 } });
  });

  it('通道非 ChannelUnavailableError 异常向外抛（归执行器统一兜底）', async () => {
    const tool = createScreenSnapshotTool(
      clientWith(async () => {
        throw new Error('unexpected');
      }),
    );
    await expect(tool.run({ scope: 'fullscreen' }, makeCtx(true))).rejects.toThrow('unexpected');
  });
});
