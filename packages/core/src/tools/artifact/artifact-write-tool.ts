import { z } from 'zod';
import {
  ARTIFACT_FORMATS,
  ARTIFACT_FILENAME_MAX,
  ARTIFACT_MAX_BYTES,
  ARTIFACT_MAX_PER_TURN,
  ARTIFACT_TITLE_MAX,
} from '@wbfm/shared/constants';
import type { Tool, ToolResult } from '../types';
import { ToolArgError } from '../types';

const argsSchema = z.object({
  title: z.string().trim().min(1).max(ARTIFACT_TITLE_MAX),
  filename: z.string().trim().min(1).max(ARTIFACT_FILENAME_MAX),
  format: z.enum(ARTIFACT_FORMATS),
  content: z.string().min(1).max(ARTIFACT_MAX_BYTES),
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** v2.18 M1：把模型生成的 HTML/SVG/Markdown 落盘为可交付产物 */
export const artifactWriteTool: Tool = {
  name: 'artifact_write',
  description:
    `把生成的 HTML/SVG/Markdown 保存为可预览、可下载的产物文件。需要用户授权；单文件最多 2MB，单轮最多 ${ARTIFACT_MAX_PER_TURN} 个。产物不会进入模型上下文。`,
  permission: 'write',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: `产物标题，1–${ARTIFACT_TITLE_MAX} 字` },
      filename: {
        type: 'string',
        description: `文件名，1–${ARTIFACT_FILENAME_MAX} 字；可省略扩展名`,
      },
      format: { type: 'string', enum: [...ARTIFACT_FORMATS], description: '产物格式' },
      content: { type: 'string', description: '完整文本内容，最大 2MB' },
    },
    required: ['title', 'filename', 'format', 'content'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((issue) => issue.message).join('；'));
    }
    if (!ctx.writeArtifact) {
      return {
        ok: false,
        output: '产物保存不可用：当前运行环境未装配产物服务。',
        summary: '产物不可用',
      };
    }
    try {
      const artifact = ctx.writeArtifact(parsed.data);
      return {
        ok: true,
        output: [
          `已生成产物：${artifact.title}`,
          `格式：${artifact.format}`,
          `文件名：${artifact.filename}`,
          `大小：${formatBytes(artifact.byteSize)}`,
        ].join('\n'),
        summary: `${artifact.format} · ${formatBytes(artifact.byteSize)}`,
        artifacts: [artifact],
      };
    } catch (error) {
      return {
        ok: false,
        output: `产物保存失败：${error instanceof Error ? error.message : String(error)}`,
        summary: '产物保存失败',
      };
    }
  },
};
