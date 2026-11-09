import type * as PIXI from 'pixi.js';

/**
 * v1.9 舞台省电档：截当前帧为 PNG dataURL。
 * 失败或模型未加载完返回 null，调用方保持 Live2D 渲染。
 */
export function captureStageFrame(app: PIXI.Application, loaded: boolean): string | null {
  if (!loaded) return null;
  try {
    // 先渲染一帧，确保 extract 拿到的是当前表情/动作而不是空舞台
    app.renderer.render(app.stage);
    // pixi v7 的 extract 挂在 Renderer 实例上，基类类型不含它
    const renderer = app.renderer as unknown as {
      extract: { canvas: (target: unknown) => HTMLCanvasElement };
    };
    return renderer.extract.canvas(app.stage).toDataURL('image/png');
  } catch {
    return null;
  }
}
