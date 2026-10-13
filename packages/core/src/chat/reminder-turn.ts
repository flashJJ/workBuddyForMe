/**
 * v1.7 M5 对话内创建提醒的确定性短路回合（不调用 LLM）。
 *
 * 用户消息命中本地提醒解析时：
 * - create：落 scheduled_tasks，回复固定双语确认（语言取 app 设置），正常走 delta/done；
 * - needTime：回复追问，引导补具体时间；
 * - none：返回 null，调用方继续正常模型回合。
 *
 * 不走 RAG/工具/记忆后台任务；助手消息仍正常落库（状态 completed）。
 */
import type { Database } from 'better-sqlite3';
import { createSettingsService, createConversationService } from '../services';
import { createSchedulesService } from '../scheduler/schedules-service';
import { parseReminderRequest, type ParsedReminder } from '../scheduler/reminder-parse';
import type { ServiceDeps } from '../services/deps';

type Language = 'zh-CN' | 'en-US';

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function timePrefix(reminder: ParsedReminder, lang: Language): string {
  const time = `${pad2(reminder.hour)}:${pad2(reminder.minute)}`;
  if (reminder.kind === 'daily') {
    return lang === 'en-US' ? `every day at ${time}` : `每天 ${time}`;
  }
  if (reminder.kind === 'weekly' && reminder.weekday !== null && reminder.weekday !== undefined) {
    const day = lang === 'en-US' ? WEEKDAY_EN[reminder.weekday] : WEEKDAY_ZH[reminder.weekday];
    return lang === 'en-US' ? `every ${day} at ${time}` : `每${day} ${time}`;
  }
  // once：atDate 即 YYYY-MM-DD；zh 转「M月D日」更自然，en 保留 ISO
  if (lang === 'en-US') return `${reminder.atDate} ${time}`;
  const [, month, day] = (reminder.atDate ?? '').split('-').map(Number);
  return `${month}月${day}日 ${time}`;
}

function buildReply(reminder: ParsedReminder, lang: Language): string {
  const time = `${pad2(reminder.hour)}:${pad2(reminder.minute)}`;
  if (lang === 'en-US') {
    let when: string;
    if (reminder.kind === 'daily') {
      when = `every day at ${time}`;
    } else if (reminder.kind === 'weekly' && reminder.weekday !== null && reminder.weekday !== undefined) {
      when = `every ${WEEKDAY_EN[reminder.weekday]} at ${time}`;
    } else {
      when = `on ${reminder.atDate} ${time}`;
    }
    return `Done — I'll remind you ${when}: ${reminder.text}`;
  }
  return `好的，已为你设好提醒：${timePrefix(reminder, lang)}，${reminder.text}。`;
}

function buildNeedTimeReply(lang: Language): string {
  return lang === 'en-US'
    ? 'Sure! When should I remind you? Tell me a specific time, for example “tomorrow at 3pm” or “every day at 9pm”.'
    : '可以呀，想让我什么时候提醒你？给我一个具体时间吧，比如「明天下午三点」或「每天晚上九点」。';
}

/** 服务端 SSE 事件形状（与 streamChat 既有协议一致） */
type ReminderEvent =
  | { event: 'delta'; data: { content: string } }
  | { event: 'done'; data: { content: string; usage: null } };

export interface ReminderTurnDeps {
  deps: ServiceDeps;
  db: Database;
  assistantId: string;
  assistantMessageId: string;
  userText: string;
  nowMs?: number;
}

/**
 * 尝试把用户消息作为提醒请求短路处理；非提醒意图返回 null。
 * 副作用（建提醒/助手消息落库）在返回前完成；调用方按序 yield 事件。
 */
export async function tryReminderTurn(
  params: ReminderTurnDeps,
): Promise<ReminderEvent[] | null> {
  const parsed = parseReminderRequest(params.userText, params.nowMs ?? Date.now());
  if (parsed.outcome === 'none') return null;

  const settings = createSettingsService(params.deps);
  const lang: Language = settings.get().language === 'en-US' ? 'en-US' : 'zh-CN';
  const conversations = createConversationService(params.deps);

  let reply: string;
  if (parsed.outcome === 'needTime') {
    reply = buildNeedTimeReply(lang);
  } else {
    const { reminder } = parsed;
    try {
      createSchedulesService(params.deps).create({
        assistantId: params.assistantId,
        kind: reminder.kind,
        hour: reminder.hour,
        minute: reminder.minute,
        weekday: reminder.weekday ?? null,
        atDate: reminder.atDate ?? null,
        timezone: 'Asia/Shanghai',
        text: reminder.text.slice(0, 200),
      });
    } catch {
      // 建提醒失败（如 once 时间过期等边界）：回落正常模型回合，不伪装成功
      return null;
    }
    reply = buildReply(reminder, lang);
  }

  conversations.completeMessage(params.assistantMessageId, reply, null, []);
  return [
    { event: 'delta', data: { content: reply } },
    { event: 'done', data: { content: reply, usage: null } },
  ];
}
