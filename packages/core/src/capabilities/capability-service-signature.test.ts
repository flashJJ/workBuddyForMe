import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityTrustedKey } from '@wbfm/shared/schemas';
import {
  createDatabase,
  createInstalledEventScriptRepository,
  createReportWidgetRepository,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { McpRegistry } from '../mcp/registry';
import { createMotionService } from '../services/motion-service';
import { createSkillService } from '../skills/skill-service';
import { createCapabilityService } from './capability-service';
import {
  buildFakeVrma,
  buildSignedSkillPack,
  ed25519Pair,
  trustedKey,
} from './capability-test-helpers';
import { buildSampleSkillPack } from './samples';

describe('v2.12 能力包签名策略', () => {
  let db: DatabaseInstance;
  let skills: ReturnType<typeof createSkillService>;
  let service: ReturnType<typeof createCapabilityService>;
  let signatureSettings: {
    capabilitySignaturePolicy: 'off' | 'warn' | 'require';
    capabilityTrustedKeys: CapabilityTrustedKey[];
  };

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'wbfm-cap-sign-'));
    setDataRootForTest(root);
    db = createDatabase();
    const skillsDir = join(root, 'skills');
    skills = createSkillService({ db }, { skillsDir, seedBuiltins: false });
    const mcp = {
      createServer: vi.fn(() => ({ id: 'server-1' })),
      removeServer: vi.fn(),
    } as unknown as McpRegistry;
    signatureSettings = { capabilitySignaturePolicy: 'warn', capabilityTrustedKeys: [] };
    service = createCapabilityService({
      db,
      skills,
      mcp,
      workflows: createWorkflowRepository(db),
      motions: createMotionService(db),
      eventScripts: createInstalledEventScriptRepository(db),
      reportWidgets: createReportWidgetRepository(db),
      settings: { get: () => signatureSettings },
      rootDir: join(root, 'capabilities'),
      skillsDir,
      sampleMotionAsset: () => buildFakeVrma(),
    });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('off 跳过验签，warn 允许未签名，require 拒绝未签名', () => {
    signatureSettings.capabilitySignaturePolicy = 'off';
    const offInstalled = service.install(buildSampleSkillPack());
    expect(offInstalled.signatureStatus).toBe('unchecked');
    service.uninstall(offInstalled.id);

    signatureSettings.capabilitySignaturePolicy = 'require';
    expect(() => service.install(buildSampleSkillPack())).toThrow(/有效签名/);

    signatureSettings.capabilitySignaturePolicy = 'warn';
    const warnInstalled = service.install(buildSampleSkillPack());
    expect(warnInstalled.signatureStatus).toBe('none');
  });

  it('有效签名：信任库命中 valid；移除密钥后 require 下启用被拒', () => {
    const pair = ed25519Pair();
    signatureSettings.capabilitySignaturePolicy = 'require';
    signatureSettings.capabilityTrustedKeys = [trustedKey('local-dev', pair.publicKeyPem)];
    const installed = service.install(buildSignedSkillPack(pair.privateKey));
    expect(installed.signatureStatus).toBe('valid');
    expect(skills.list().some((item) => item.name === 'signed-demo')).toBe(true);

    service.disable(installed.id);
    signatureSettings.capabilityTrustedKeys = [];
    expect(() => service.enable(installed.id)).toThrow(/有效签名/);
    expect(service.list()[0]!.status).toBe('disabled');
  });

  it('warn 下无效签名拒绝；未知密钥放行但标记 untrusted', () => {
    const signer = ed25519Pair();
    const trusted = ed25519Pair();
    signatureSettings.capabilitySignaturePolicy = 'warn';
    signatureSettings.capabilityTrustedKeys = [trustedKey('local-dev', trusted.publicKeyPem)];
    expect(() => service.install(buildSignedSkillPack(signer.privateKey, 'local-dev'))).toThrow(
      /签名无效/,
    );

    const untrusted = service.install(buildSignedSkillPack(signer.privateKey, 'other-key'));
    expect(untrusted.signatureStatus).toBe('untrusted');
  });
});
