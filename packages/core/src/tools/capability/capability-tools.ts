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

const listArgsSchema = z.object({
  kind: z.enum(CAPABILITY_KINDS).optional(),
  status: z.enum(['enabled', 'disabled', 'all']).default('all'),
});

const LIST_LIMIT = 30;

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

/** v2.30：已安装能力清单（只读；不访问网络、不触发安装） */
export const capabilityListTool: Tool = {
  name: 'capability_list',
  description:
    '列出现已安装的能力包（技能 / MCP / 工作流 / 桌面动作 / 事件剧本 / 报告组件），包含状态、版本、权限、效果与新增工具。只读。',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: [...CAPABILITY_KINDS],
        description: '可选：按能力包种类过滤',
      },
      status: {
        type: 'string',
        enum: ['enabled', 'disabled', 'all'],
        description: '可选：按启用状态过滤，默认 all',
      },
    },
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = listArgsSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((issue) => issue.message).join('；'));
    }
    if (!ctx.listCapabilities) {
      return {
        ok: false,
        output: '能力清单不可用：当前运行环境未装配能力目录服务。',
        summary: '能力清单不可用',
      };
    }
    const items = ctx
      .listCapabilities()
      .filter((item) => (parsed.data.kind ? item.kind === parsed.data.kind : true))
      .filter((item) => (parsed.data.status === 'all' ? true : item.status === parsed.data.status));
    if (items.length === 0) {
      return { ok: true, output: '当前没有匹配的已安装能力。', summary: '0 个能力' };
    }
    const lines = items.slice(0, LIST_LIMIT).map((item, index) =>
      [
        `${index + 1}. ${item.name}（${item.kind}）`,
        `   id: ${item.id}`,
        `   状态：${item.status === 'enabled' ? '已启用' : '已停用'} · 版本：${item.version}`,
        `   权限：${listOf(item.permissions)}`,
        `   效果：${listOf(item.effects)}`,
        `   工具：${listOf(item.toolNames)}`,
        `   签名：${item.signatureStatus ?? '未检查'}`,
      ].join('\n'),
    );
    const more =
      items.length > LIST_LIMIT
        ? `\n\n另有 ${items.length - LIST_LIMIT} 项未展示，请用 kind 或 status 缩小范围。`
        : '';
    return {
      ok: true,
      output: clip(`已安装能力（${items.length} 个）：\n\n${lines.join('\n\n')}${more}`),
      summary: `${items.length} 个能力`,
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
