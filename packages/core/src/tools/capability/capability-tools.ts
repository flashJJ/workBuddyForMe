import { z } from 'zod';
import { CAPABILITY_KINDS } from '@wbfm/shared/schemas';
import type { Tool, ToolResult } from '../types';
import { ToolArgError } from '../types';

const OUTPUT_MAX_CHARS = 6_000;

const searchArgsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  kind: z.enum(CAPABILITY_KINDS).optional(),
});

const installArgsSchema = z.object({
  catalogId: z.string().trim().min(3).max(80),
  reason: z.string().trim().max(200).optional(),
});

function clip(text: string): string {
  return text.length > OUTPUT_MAX_CHARS ? `${text.slice(0, OUTPUT_MAX_CHARS)}…` : text;
}

function listOf(values: readonly string[]): string {
  return values.length > 0 ? values.join('、') : '无';
}

/** v2.17 M4：能力目录检索（只读） */
export const capabilitySearchTool: Tool = {
  name: 'capability_search',
  description:
    '搜索可安装的能力包目录，返回用途、权限、预计新增工具与安装状态。只读；安装需调用 capability_install 并由用户审批。',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '按用途/关键词搜索，1–200 字' },
      kind: {
        type: 'string',
        enum: [...CAPABILITY_KINDS],
        description: '可选：按能力包种类过滤',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = searchArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((issue) => issue.message).join('；'));
    }
    if (!ctx.searchCapabilities) {
      return {
        ok: false,
        output: '能力目录不可用：当前运行环境未装配能力目录服务。',
        summary: '目录不可用',
      };
    }
    const items = ctx.searchCapabilities({
      query: parsed.data.query,
      ...(parsed.data.kind ? { kind: parsed.data.kind } : {}),
    });
    if (items.length === 0) {
      return {
        ok: true,
        output: '能力目录中没有匹配的候选；可换关键词或去掉 kind 过滤。',
        summary: '0 个候选',
      };
    }
    const lines = items.map((item, index) => {
      const status = item.installed
        ? item.status === 'enabled'
          ? '已安装并启用'
          : '已安装（停用）'
        : '未安装';
      return [
        `${index + 1}. ${item.name}（${item.kind}）`,
        `   id: ${item.id}`,
        `   说明：${item.description || '无'}`,
        `   权限：${listOf(item.permissions)}`,
        `   效果：${listOf(item.effects)}`,
        `   新增工具：${listOf(item.toolNames)}`,
        `   状态：${status}`,
      ].join('\n');
    });
    return {
      ok: true,
      output: clip(`能力目录候选（${items.length} 个）：\n\n${lines.join('\n\n')}`),
      summary: `${items.length} 个候选`,
    };
  },
};

/** v2.17 M4：能力安装代理（write；由权限门触发 HITL 审批） */
export const capabilityInstallTool: Tool = {
  name: 'capability_install',
  description:
    '安装能力目录中的能力包，必须经用户审批后才会执行。安装成功后只读工具会在下一轮自动加入当前助手；写/危险工具仍需用户在助手设置中手动勾选。',
  permission: 'write',
  // 安装不可静默：即使 full_access/策略 allow 也强制走人工审批
  alwaysConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      catalogId: {
        type: 'string',
        description: '能力目录条目 id（来自 capability_search）',
      },
      reason: { type: 'string', description: '可选：向用户说明安装原因，最多 200 字' },
    },
    required: ['catalogId'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = installArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((issue) => issue.message).join('；'));
    }
    if (!ctx.installCapability) {
      return {
        ok: false,
        output: '能力安装不可用：当前运行环境未装配能力目录服务。',
        summary: '安装不可用',
      };
    }
    try {
      const result = ctx.installCapability({
        catalogId: parsed.data.catalogId,
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
      });
      let binding: { added: string[]; skipped: string[] } = { added: [], skipped: [] };
      let bindingError: string | null = null;
      if (ctx.bindTools) {
        try {
          binding = ctx.bindTools(result.entry.toolNames);
        } catch (error) {
          // 能力已安装成功；绑定失败不应伪装成安装失败
          bindingError = error instanceof Error ? error.message : String(error);
        }
      }
      const lines = [
        `已安装并启用：${result.entry.name}（${result.entry.id}，${result.entry.kind}，v${result.capability.version}）`,
        `权限：${listOf(result.entry.permissions)}`,
        `效果：${listOf(result.entry.effects)}`,
      ];
      if (bindingError) {
        lines.push(`工具自动绑定失败（能力已安装）：${bindingError}；请到助手设置手动勾选。`);
      } else if (!ctx.bindTools && result.entry.toolNames.length > 0) {
        lines.push(`请到助手设置手动勾选新增工具：${result.entry.toolNames.join('、')}`);
      } else {
        if (binding.added.length > 0) {
          lines.push(`已加入当前助手（下一轮可用）：${binding.added.join('、')}`);
        }
        if (binding.skipped.length > 0) {
          lines.push(`未自动绑定（write/danger 需手动勾选）：${binding.skipped.join('、')}`);
        }
        if (
          binding.added.length === 0 &&
          binding.skipped.length === 0 &&
          result.entry.toolNames.length === 0
        ) {
          lines.push('该能力不新增工具，效果已生效。');
        }
      }
      return {
        ok: true,
        output: clip(lines.join('\n')),
        summary: `已安装 ${result.entry.name}`,
      };
    } catch (error) {
      return {
        ok: false,
        output: `安装失败：${error instanceof Error ? error.message : String(error)}`,
        summary: '安装失败',
      };
    }
  },
};
