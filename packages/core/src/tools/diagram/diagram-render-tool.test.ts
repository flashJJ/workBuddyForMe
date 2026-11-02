import { describe, expect, it, vi } from 'vitest';
import type { ArtifactRef } from '@wbfm/shared/types';
import type { ToolContext } from '../types';
import { ToolArgError } from '../types';
import { diagramRenderTool } from './diagram-render-tool';

const ref: ArtifactRef = {
  attachmentId: 'att-d',
  title: '系统架构',
  filename: '系统架构.html',
  format: 'html',
  mimeType: 'text/html',
  byteSize: 2048,
};

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return { knowledgeBaseIds: [], retrieve: async () => [], ...overrides };
}

describe('diagram_render 工具', () => {
  it('write 权限；未装配产物服务时明确拒绝', async () => {
    expect(diagramRenderTool.permission).toBe('write');
    const result = await diagramRenderTool.run(
      { type: 'bar', title: '销量', data: { categories: [{ label: 'Q1', value: 1 }] } },
      context(),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('图表保存不可用');
  });

  it('生成图表并返回产物引用', async () => {
    const writeArtifact = vi.fn(() => ref);
    const result = await diagramRenderTool.run(
      {
        type: 'architecture',
        title: '系统架构',
        data: {
          nodes: [
            { id: 'web', label: 'Web' },
            { id: 'core', label: 'Core' },
          ],
          edges: [{ from: 'web', to: 'core' }],
        },
      },
      context({ writeArtifact }),
    );
    expect(result.ok).toBe(true);
    expect(writeArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ title: '系统架构', filename: '系统架构', format: 'html' }),
    );
    expect(result.artifacts).toEqual([ref]);
  });

  it('数据引用不存在节点时返回可读失败', async () => {
    const writeArtifact = vi.fn(() => ref);
    const result = await diagramRenderTool.run(
      {
        type: 'flow',
        title: '坏流程',
        data: {
          nodes: [{ id: 'a', label: 'A' }],
          edges: [{ from: 'a', to: 'missing' }],
        },
      },
      context({ writeArtifact }),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('不存在的节点');
    expect(writeArtifact).not.toHaveBeenCalled();
  });

  it('参数缺失或类型未知抛 ToolArgError', async () => {
    await expect(
      diagramRenderTool.run({ type: 'unknown', title: 'x', data: {} }, context()),
    ).rejects.toBeInstanceOf(ToolArgError);
    await expect(
      diagramRenderTool.run({ type: 'bar', title: 'x' }, context()),
    ).rejects.toBeInstanceOf(ToolArgError);
  });

  it('折线长度不一致抛 ToolArgError', async () => {
    await expect(
      diagramRenderTool.run(
        {
          type: 'line',
          title: '留存',
          data: {
            labels: ['1月', '2月'],
            series: [{ name: 'a', values: [1] }],
          },
        },
        context(),
      ),
    ).rejects.toBeInstanceOf(ToolArgError);
  });
});
