/**
 * eval SSE 客户端（v1.1 M5 从 eval-memory 抽出）：
 * 按 wbfm wire 协议（M4 契约）解析 /api/chat/* 事件流。
 * 唯一结束语义：done（正常收尾）/ error（失败）——不得用其它信号替代，
 * 否则会提前结束或永不收敛。
 */

/**
 * POST 一个 SSE 流并收集事件。
 * @returns {Promise<{content:string, events:Array<{event:string,data:any}>, error:string|null, usage:any}>}
 *   content = 全部 delta 拼接；events = 按序全部事件；error = error 帧消息；usage = done 帧 token
 */
export async function streamChat(baseUrl, path, body, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    throw new Error(`${path} 建立失败：HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let error = null;
  let usage = null;
  const events = [];

  const handleEvent = (rawEvent) => {
    const lines = rawEvent.split('\n');
    const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
    const dataLine = lines.find((line) => line.startsWith('data:'));
    if (!eventName || !dataLine) return;
    const data = JSON.parse(dataLine.slice(5).trim());
    events.push({ event: eventName, data });
    if (eventName === 'delta') content += data.content;
    if (eventName === 'done') usage = data.usage ?? null;
    if (eventName === 'error') error = data.message ?? data.code;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      handleEvent(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
    }
  }
  if (buffer.trim()) handleEvent(buffer);
  return { content, events, error, usage };
}

/** 从事件集合取指定名称事件的 data 列表（断言用） */
export function eventsOf(events, name) {
  return events.filter((e) => e.event === name).map((e) => e.data);
}
