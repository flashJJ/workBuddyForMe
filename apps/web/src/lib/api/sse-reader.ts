/**
 * 浏览器侧增量 SSE 解析：维护半包缓冲，按空行切分事件块。
 * 每次 feed 返回本批完整事件，未完成片段留在缓冲内等待下次。
 */
export interface RawSseEvent {
  event: string;
  data: unknown;
}

export class SseReader {
  private buffer = '';

  feed(chunk: string): RawSseEvent[] {
    this.buffer += chunk;
    const blocks: string[] = [];
    let separator: number;
    while ((separator = this.buffer.indexOf('\n\n')) !== -1) {
      blocks.push(this.buffer.slice(0, separator));
      this.buffer = this.buffer.slice(separator + 2);
    }

    const events: RawSseEvent[] = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));
      if (!eventLine || !dataLine) continue;
      try {
        events.push({
          event: eventLine.slice(7).trim(),
          data: JSON.parse(dataLine.slice(6)) as unknown,
        });
      } catch {
        // 忽略半包/异常数据帧
      }
    }
    return events;
  }
}
