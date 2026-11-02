import { describe, expect, it, vi } from 'vitest';
import type { ArtifactRef } from '@wbfm/shared/types';
import type { ToolContext } from '../types';
import { ToolArgError } from '../types';
import { artifactWriteTool } from './artifact-write-tool';

const ref: ArtifactRef = {
  attachmentId: 'att-1',
  title: '架构图',
  filename: 'architecture.html',
  format: 'html',
  mimeType: 'text/html',
  byteSize: 4096,
};

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    knowledgeBaseIds: [],
    retrieve: async () => [],
    ...overrides,
  };
}

describe('artifact_write 工具', () => {
  it('write 权限；未装配产物服务时明确拒绝', async () => {
    expect(artifactWriteTool.permission).toBe('write');
    const result = await artifactWriteTool.run(
      { title: '图', filename: 'a', format: 'html', content: '<p>x</p>' },
      context(),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('产物保存不可用');
  });

  it('成功写入并返回产物引用与摘要', async () => {
    const writeArtifact = vi.fn(() => ref);
    const result = await artifactWriteTool.run(
      { title: '架构图', filename: 'architecture', format: 'html', content: '<html></html>' },
      context({ writeArtifact }),
    );
    expect(result.ok).toBe(true);
    expect(writeArtifact).toHaveBeenCalledWith({
      title: '架构图',
      filename: 'architecture',
      format: 'html',
      content: '<html></html>',
    });
    expect(result.artifacts).toEqual([ref]);
    expect(result.summary).toContain('html');
    expect(result.summary).toContain('4.0 KB');
  });

  it('服务报错返回 ok=false，不抛出', async () => {
    const writeArtifact = vi.fn(() => {
      throw new Error('产物超过 2MB 上限');
    });
    const result = await artifactWriteTool.run(
      { title: '图', filename: 'a', format: 'svg', content: '<svg></svg>' },
      context({ writeArtifact }),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('产物保存失败：产物超过 2MB 上限');
  });

  it('参数非法抛 ToolArgError', async () => {
    await expect(
      artifactWriteTool.run(
        { title: '', filename: 'a', format: 'html', content: '<p>x</p>' },
        context(),
      ),
    ).rejects.toBeInstanceOf(ToolArgError);
    await expect(
      artifactWriteTool.run(
        { title: '图', filename: 'a', format: 'unknown', content: '<p>x</p>' },
        context(),
      ),
    ).rejects.toBeInstanceOf(ToolArgError);
  });
});
