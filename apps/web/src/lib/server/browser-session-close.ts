import { createComputerChannelClient } from '@wbfm/core/computer';

/** v2.13 M5：任务运行终态关闭隔离网页会话（纯 Web / 通道不可用时静默忽略） */
export async function closeBrowserSession(runId: string): Promise<void> {
  try {
    const client = createComputerChannelClient();
    await client.browserClose({ runId });
  } catch {
    // 没有会话 / 非桌面端：无需清理
  }
}
