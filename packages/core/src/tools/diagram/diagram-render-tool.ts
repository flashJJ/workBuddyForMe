import { z } from 'zod';
import { DIAGRAM_SIZES, DIAGRAM_TYPES, diagramInputSchema, renderDiagram } from '../../diagrams';
import type { Tool, ToolResult } from '../types';
import { ToolArgError } from '../types';

const argsSchema = z.object({
  type: z.enum(DIAGRAM_TYPES),
  title: z.string().trim().min(1).max(80),
  size: z.enum(DIAGRAM_SIZES).optional(),
  data: z.record(z.string(), z.unknown()),
});

/** v2.18 M2：结构化图表渲染并直接落盘（write + HITL），避免把 SVG 回灌模型上下文 */
export const diagramRenderTool: Tool = {
  name: 'diagram_render',
  description:
    '按结构化数据生成图表并保存为 HTML 产物。支持 10 类：architecture / flow / sequence / state / er / timeline / quadrant / swimlane / bar / line。模型只提供节点/边或数值，布局与 SVG 由模板生成；保存需用户授权。',
  permission: 'write',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...DIAGRAM_TYPES], description: '图表类型' },
      title: { type: 'string', description: '图表标题，1–80 字' },
      size: {
        type: 'string',
        enum: [...DIAGRAM_SIZES],
        description: '画布尺寸，默认 doc-inline',
      },
      data: {
        type: 'object',
        description:
          '结构化数据：结构图用 nodes/edges（sequence 用 actors/messages；er 用 entities/relations；timeline 用 events；quadrant 用 xAxis/yAxis/points；swimlane 用 lanes/steps/edges；bar 用 categories；line 用 labels/series）',
      },
    },
    required: ['type', 'title', 'data'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((issue) => issue.message).join('；'));
    }
    const diagram = diagramInputSchema.safeParse({
      ...parsed.data.data,
      type: parsed.data.type,
      title: parsed.data.title,
      ...(parsed.data.size ? { size: parsed.data.size } : {}),
    });
    if (!diagram.success) {
      throw new ToolArgError(
        `图表数据不合法：${diagram.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || '(根)'}: ${issue.message}`)
          .join('；')}`,
      );
    }
    if (diagram.data.type === 'line') {
      for (const series of diagram.data.series) {
        if (series.values.length !== diagram.data.labels.length) {
          throw new ToolArgError(
            `折线图序列「${series.name}」的数值个数与标签数不一致`,
          );
        }
      }
    }
    if (!ctx.writeArtifact) {
      return {
        ok: false,
        output: '图表保存不可用：当前运行环境未装配产物服务。',
        summary: '图表不可用',
      };
    }
    try {
      const rendered = renderDiagram(diagram.data);
      const artifact = ctx.writeArtifact({
        title: rendered.title,
        filename: rendered.title,
        format: 'html',
        content: rendered.html,
      });
      return {
        ok: true,
        output: `已生成图表：${rendered.title}（${rendered.type}）`,
        summary: `${rendered.type} · 已保存`,
        artifacts: [artifact],
      };
    } catch (error) {
      return {
        ok: false,
        output: `图表生成失败：${error instanceof Error ? error.message : String(error)}`,
        summary: '图表生成失败',
      };
    }
  },
};
