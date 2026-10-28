import { WORK_STEP_STATUSES } from '@wbfm/shared/schemas';
import { ToolArgError, type Tool } from './types';

/**
 * v2.8：todo_write——维护当前会话的轻量待办清单（Plan 的 todo 视图）。
 * 只写本地会话状态，不触发外部副作用；清单按调用全量替换。
 */

const MAX_TODOS = 50;

export const todoWriteTool: Tool = {
  name: 'todo_write',
  description:
    '维护当前会话的待办清单（全量替换）。执行多步任务时用它记录进度；每次调用传入完整清单，已完成项标 done。',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: '完整待办清单（1-50 项）',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '待办内容' },
            status: {
              type: 'string',
              enum: [...WORK_STEP_STATUSES],
              description: '状态，默认 pending',
            },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
    required: ['todos'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx) {
    if (!ctx.writeTodos) {
      return { ok: false, output: '当前回合没有可用的待办清单通道。', summary: '待办不可用' };
    }
    const args = rawArgs as { todos?: unknown };
    if (!args || !Array.isArray(args.todos)) {
      throw new ToolArgError('todos 必须是数组');
    }
    if (args.todos.length === 0 || args.todos.length > MAX_TODOS) {
      throw new ToolArgError(`todos 数量必须在 1-${MAX_TODOS} 之间`);
    }
    const todos = args.todos.map((item) => {
      const row = item as { title?: unknown; status?: unknown };
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (!title) throw new ToolArgError('每个待办都必须有非空 title');
      const status =
        typeof row.status === 'string' &&
        (WORK_STEP_STATUSES as readonly string[]).includes(row.status)
          ? (row.status as (typeof WORK_STEP_STATUSES)[number])
          : 'pending';
      return { title, status };
    });
    const result = ctx.writeTodos(todos);
    return {
      ok: true,
      output: `已更新待办：${result.done}/${result.total} 完成。`,
      summary: `待办 ${result.done}/${result.total}`,
    };
  },
};
