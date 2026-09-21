import type { Tool } from './types';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

function formatTime(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const weekday = WEEKDAYS[now.getDay()];
  return `${date} ${time} 星期${weekday}（本机时区）`;
}

/**
 * current_time：查询当前日期时间。零参数、零依赖、零网络。
 */
export const currentTimeTool: Tool = {
  name: 'current_time',
  description:
    '获取本机当前日期与时间。当用户询问今天几号、星期几、现在几点等任何与实时时间有关的问题时调用。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },

  async run(rawArgs) {
    if (rawArgs && typeof rawArgs === 'object' && Object.keys(rawArgs).length > 0) {
      return {
        ok: true,
        output: `当前时间：${formatTime(new Date())}（本工具不接受参数，多余参数已忽略）`,
        summary: '当前时间',
      };
    }
    const formatted = formatTime(new Date());
    return {
      ok: true,
      output: `当前时间：${formatted}`,
      summary: formatted,
    };
  },
};
