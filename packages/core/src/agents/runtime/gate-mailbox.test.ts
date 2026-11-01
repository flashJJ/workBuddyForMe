import { describe, expect, it } from 'vitest';
import { GateMailbox, MAILBOX_DONE, type ExecutorGateFrame } from './gate-mailbox';

const frame = (callId: string): ExecutorGateFrame => ({
  callId,
  tool: 'mouse_click',
  permission: 'danger',
  argsSummary: '{}',
  taskScope: 'task-1',
});

/** 永不定型的执行 Promise（仅门控帧能结束等待） */
const neverSettles = new Promise<void>(() => {});

describe('GateMailbox（M4 HITL 门控帧邮箱）', () => {
  it('先 post 后 take：按 FIFO 立即取到', async () => {
    const box = new GateMailbox();
    box.post(frame('c1'));
    box.post(frame('c2'));
    await expect(box.takeOrDone(neverSettles)).resolves.toMatchObject({ callId: 'c1' });
    await expect(box.takeOrDone(neverSettles)).resolves.toMatchObject({ callId: 'c2' });
  });

  it('先 take 后 post：等待者收到帧', async () => {
    const box = new GateMailbox();
    const waiting = box.takeOrDone(neverSettles);
    box.post(frame('c3'));
    await expect(waiting).resolves.toMatchObject({ callId: 'c3' });
  });

  it('abort 时返回 MAILBOX_DONE，队列帧不被消费', async () => {
    const box = new GateMailbox();
    const controller = new AbortController();
    const waiting = box.takeOrDone(neverSettles, controller.signal);
    controller.abort();
    expect(await waiting).toBe(MAILBOX_DONE);
    box.post(frame('c4'));
    await expect(box.takeOrDone(neverSettles)).resolves.toMatchObject({ callId: 'c4' });
  });

  it('执行 Promise 先定型：返回 MAILBOX_DONE 且不漏掉已入队帧', async () => {
    const box = new GateMailbox();
    box.post(frame('c5'));
    await expect(box.takeOrDone(Promise.resolve())).resolves.toMatchObject({ callId: 'c5' });
    await expect(box.takeOrDone(Promise.resolve())).resolves.toBe(MAILBOX_DONE);
  });
});
