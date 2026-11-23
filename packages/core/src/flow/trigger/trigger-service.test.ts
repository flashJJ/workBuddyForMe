import type { FlowGraph } from '@wbfm/shared/schemas';
import { join, parse } from 'node:path';
import {
  createDatabase,
  createWorkflowRepository,
  createWorkflowRunRepository,
  createWorkflowTriggerRepository,
} from '@wbfm/database';
import { describe, expect, it } from 'vitest';
import type { CreateRunParams } from '../run/run-service-types';
import type { SecretCipher } from '../../secrets/cipher';
import { hashTriggerSecret, signWebhookPayload } from './trigger-auth';
import { createFlowTriggerService } from './trigger-service';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 1, y: 0 }, config: {} },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

function setup(cipher?: SecretCipher) {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const triggers = createWorkflowTriggerRepository(db);
  const wf = workflows.createWorkflow({ name: '事件流' });
  workflows.addVersion(wf.id, graph);
  workflows.publishVersion(wf.id);
  const calls: CreateRunParams[] = [];
  const service = createFlowTriggerService({
    triggers,
    workflows,
    runs,
    flowRunner: {
      createRun: (params) => {
        calls.push(params);
        return `run-${calls.length}`;
      },
    },
    isDirectory: () => true,
    now: () => new Date('2026-11-23T10:00:00.000Z'),
    ...(cipher ? { cipher } : {}),
  });
  return { db, wf, runs, triggers, service, calls };
}

const fakeCipher: SecretCipher = {
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (ciphertext) => (ciphertext.startsWith('enc:') ? ciphertext.slice(4) : null),
};

describe('v4.25 触发执行服务', () => {
  it('创建 Webhook：一次性 Secret、只存哈希、鉴权可用', () => {
    const { wf, triggers, service } = setup();
    const { trigger, secret } = service.create(wf.id, { kind: 'webhook', name: '回调' });
    expect(secret).toMatch(/^wft_/);
    expect(trigger.webhookPath).toContain(trigger.id);
    expect(triggers.getSecretHash(trigger.id)).toBe(hashTriggerSecret(secret!));

    expect(service.authenticateWebhook(trigger.id, `Bearer ${secret}`)).toMatchObject({ ok: true });
    expect(service.authenticateWebhook(trigger.id, 'Bearer wrong')).toMatchObject({
      ok: false,
      reason: 'unauthorized',
    });
    expect(service.authenticateWebhook('missing', 'Bearer x')).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
  });

  it('轮换 Webhook Secret：旧钥立即失效，新钥可用且只返回一次', () => {
    const { wf, triggers, service } = setup();
    const { trigger, secret: oldSecret } = service.create(wf.id, { kind: 'webhook' });
    const rotated = service.rotateSecret(wf.id, trigger.id);
    expect(rotated.secret).toMatch(/^wft_/);
    expect(rotated.secret).not.toBe(oldSecret);
    expect(rotated.trigger.webhookPath).toBe(trigger.webhookPath);
    expect(triggers.getSecretHash(trigger.id)).toBe(hashTriggerSecret(rotated.secret));

    expect(service.authenticateWebhook(trigger.id, `Bearer ${oldSecret}`)).toMatchObject({
      ok: false,
      reason: 'unauthorized',
    });
    expect(service.authenticateWebhook(trigger.id, `Bearer ${rotated.secret}`)).toMatchObject({
      ok: true,
    });
  });

  it('文件触发器不支持轮换，跨流程轮换返回 404', () => {
    const { wf, service } = setup();
    const file = service.create(wf.id, {
      kind: 'file',
      config: { path: 'E:\\notes', extensions: ['md'] },
    });
    expect(() => service.rotateSecret(wf.id, file.trigger.id)).toThrow(/Webhook/);

    const webhook = service.create(wf.id, { kind: 'webhook' });
    expect(() => service.rotateSecret('other-workflow', webhook.trigger.id)).toThrow(/触发器/);
  });

  it('Webhook 触发：body 顶层合并 + payload + 保留键不可覆盖', () => {
    const { wf, service, calls } = setup();
    const { trigger } = service.create(wf.id, { kind: 'webhook' });
    const result = service.fireWebhook(trigger, {
      topic: '周报',
      count: 3,
      source: 'evil',
    });
    expect(result).toMatchObject({ ok: true, runId: 'run-1' });
    expect(calls[0]).toMatchObject({ workflowId: wf.id, trigger: 'webhook' });
    expect(calls[0]!.input).toMatchObject({
      topic: '周报',
      count: 3,
      source: 'webhook',
      triggerId: trigger.id,
      payload: { topic: '周报', count: 3, source: 'evil' },
    });
  });

  it('单飞：同流程有在途运行时返回 busy 并记录 skipped_busy', () => {
    const { wf, runs, triggers, service } = setup();
    const { trigger } = service.create(wf.id, { kind: 'webhook' });
    runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    const result = service.fireWebhook(trigger, {});
    expect(result).toMatchObject({ ok: false, reason: 'busy' });
    expect(triggers.getById(trigger.id)?.lastStatus).toBe('skipped_busy');
  });

  it('幂等键：TTL 内重复请求返回 duplicate，且不创建运行', () => {
    const { wf, service, calls } = setup();
    const { trigger } = service.create(wf.id, { kind: 'webhook' });
    expect(service.fireWebhook(trigger, {}, 'k1')).toMatchObject({ ok: true });
    expect(service.fireWebhook(trigger, {}, 'k1')).toMatchObject({
      ok: false,
      reason: 'duplicate',
    });
    expect(calls).toHaveLength(1);
    // 不同键视为新事件（fake runner 未真正建运行，单飞由独立用例覆盖）
    expect(service.fireWebhook(trigger, {}, 'k2')).toMatchObject({ ok: true, runId: 'run-2' });
    expect(calls).toHaveLength(2);
  });

  it('文件触发器：配置校验、入参形态与启停', () => {
    const { wf, triggers, service, calls } = setup();
    const dir = join(process.cwd(), 'notes-test');
    const { trigger } = service.create(wf.id, {
      kind: 'file',
      config: { path: dir, extensions: ['MD', '.txt'] },
    });
    expect(trigger.config).toEqual({ path: dir, extensions: ['md', 'txt'], recursive: true });

    const filePath = join(dir, 'a.md');
    const result = service.fireFile(trigger, {
      path: filePath,
      name: 'a.md',
      ext: 'md',
      eventType: 'add',
      changedAt: '2026-11-23T10:00:00.000Z',
    });
    expect(result).toMatchObject({ ok: true });
    expect(calls[0]).toMatchObject({ trigger: 'file' });
    expect(calls[0]!.input).toMatchObject({
      path: filePath,
      name: 'a.md',
      ext: 'md',
      eventType: 'add',
      source: 'file',
      triggerId: trigger.id,
    });

    service.update(wf.id, trigger.id, { enabled: false });
    expect(triggers.listEnabledByKind('file')).toHaveLength(0);
  });

  it('数量上限：每流程最多 5 个 Webhook', () => {
    const { wf, service } = setup();
    for (let index = 0; index < 5; index += 1) {
      service.create(wf.id, { kind: 'webhook' });
    }
    expect(() => service.create(wf.id, { kind: 'webhook' })).toThrow(/最多 5/);
  });

  it('非绝对路径与磁盘根目录被拒绝', () => {
    const { wf, service } = setup();
    const root = parse(process.cwd()).root;
    expect(() =>
      service.create(wf.id, { kind: 'file', config: { path: 'notes', extensions: ['md'] } }),
    ).toThrow(/绝对路径/);
    expect(() =>
      service.create(wf.id, { kind: 'file', config: { path: root, extensions: ['md'] } }),
    ).toThrow(/根目录/);
  });

  it('HMAC：签名可用、错误签名/过期窗口 401、轮换后旧签名失效', () => {
    const { wf, triggers, service } = setup(fakeCipher);
    const { trigger, secret } = service.create(wf.id, {
      kind: 'webhook',
      auth: { authMode: 'hmac' },
    });
    expect(trigger.authMode).toBe('hmac');
    expect(trigger.hasSigningSecret).toBe(true);
    expect(triggers.getSecretCipher(trigger.id)).toBe(`enc:${secret}`);

    const rawBody = '{"hello":"world"}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signWebhookPayload(secret!, timestamp, rawBody);
    expect(
      service.authenticateWebhook(trigger.id, null, { rawBody, timestamp, signature }),
    ).toMatchObject({ ok: true });
    expect(
      service.authenticateWebhook(trigger.id, null, {
        rawBody,
        timestamp,
        signature: signature.replace(/^./, '0'),
      }),
    ).toMatchObject({ ok: false, reason: 'unauthorized' });
    const oldTimestamp = '1000000000';
    const oldSignature = signWebhookPayload(secret!, oldTimestamp, rawBody);
    expect(
      service.authenticateWebhook(trigger.id, null, {
        rawBody,
        timestamp: oldTimestamp,
        signature: oldSignature,
      }),
    ).toMatchObject({ ok: false, reason: 'unauthorized' });
    expect(
      service.authenticateWebhook(trigger.id, `Bearer ${secret}`),
    ).toMatchObject({ ok: false, reason: 'unauthorized' });

    const rotated = service.rotateSecret(wf.id, trigger.id);
    expect(
      service.authenticateWebhook(trigger.id, null, { rawBody, timestamp, signature }),
    ).toMatchObject({ ok: false, reason: 'unauthorized' });
    const nextSignature = signWebhookPayload(rotated.secret, timestamp, rawBody);
    expect(
      service.authenticateWebhook(trigger.id, null, {
        rawBody,
        timestamp,
        signature: nextSignature,
      }),
    ).toMatchObject({ ok: true });
  });

  it('旧触发器无密文时启用 HMAC 被拒绝', () => {
    const { wf, service } = setup();
    const { trigger } = service.create(wf.id, { kind: 'webhook' });
    expect(() =>
      service.update(wf.id, trigger.id, { auth: { authMode: 'hmac' } }),
    ).toThrow(/flow\/hmac-secret-unavailable/);
  });
});
