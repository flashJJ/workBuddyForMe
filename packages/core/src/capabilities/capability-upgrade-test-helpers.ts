import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ApiError } from '@wbfm/shared/errors';
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
import { buildFakeVrma } from './capability-test-helpers';
import { CAPABILITY_MANIFEST_FILE } from './manifest';

/** v2.12：升级测试上下文（真实 DB + 真实技能/动作/工作流服务；MCP 用可控 mock） */
export interface UpgradeTestContext {
  root: string;
  db: DatabaseInstance;
  skills: ReturnType<typeof createSkillService>;
  motions: ReturnType<typeof createMotionService>;
  workflows: ReturnType<typeof createWorkflowRepository>;
  eventScripts: ReturnType<typeof createInstalledEventScriptRepository>;
  reportWidgets: ReturnType<typeof createReportWidgetRepository>;
  service: ReturnType<typeof createCapabilityService>;
  signature: {
    capabilitySignaturePolicy: 'off' | 'warn' | 'require';
    capabilityTrustedKeys: CapabilityTrustedKey[];
  };
  createdServers: string[];
  failNextCreate(): void;
  removeMcpServer(id: string): void;
  close(): void;
}

export function createUpgradeTestContext(): UpgradeTestContext {
  const root = mkdtempSync(join(tmpdir(), 'wbfm-cap-up-'));
  setDataRootForTest(root);
  const db = createDatabase();
  const skillsDir = join(root, 'skills');
  const skills = createSkillService({ db }, { skillsDir, seedBuiltins: false });
  const createdServers: string[] = [];
  const servers = new Map<string, { id: string; name: string }>();
  let failNextCreate = false;
  let serverSeq = 0;
  const mcp = {
    createServer: (config: { name?: string }) => {
      if (failNextCreate) {
        failNextCreate = false;
        throw ApiError.validation('mock create server failed');
      }
      serverSeq += 1;
      const id = `server-${serverSeq}`;
      createdServers.push(id);
      servers.set(id, { id, name: config.name ?? 'mock-mcp' });
      return { id };
    },
    removeServer: (id: string) => {
      servers.delete(id);
    },
    getServerInfos: () => Array.from(servers.values()),
  } as unknown as McpRegistry;
  const workflows = createWorkflowRepository(db);
  const motions = createMotionService(db);
  const eventScripts = createInstalledEventScriptRepository(db);
  const reportWidgets = createReportWidgetRepository(db);
  const signature: UpgradeTestContext['signature'] = {
    capabilitySignaturePolicy: 'warn',
    capabilityTrustedKeys: [],
  };
  const service = createCapabilityService({
    db,
    skills,
    mcp,
    workflows,
    motions,
    eventScripts,
    reportWidgets,
    settings: { get: () => signature },
    rootDir: join(root, 'capabilities'),
    skillsDir,
    sampleMotionAsset: () => buildFakeVrma(),
  });
  return {
    root,
    db,
    skills,
    motions,
    workflows,
    eventScripts,
    reportWidgets,
    service,
    signature,
    createdServers,
    failNextCreate: () => {
      failNextCreate = true;
    },
    removeMcpServer: (id: string) => {
      servers.delete(id);
    },
    close: () => {
      db.close();
      resetDataRootForTest();
    },
  };
}

/** 只改清单版本号、payload 与 checksums 不变（用于「内容不变、只走版本前进」的升级） */
export function bumpPackVersion(zip: Uint8Array, version: string): Uint8Array {
  const files = unzipSync(zip);
  const raw = JSON.parse(strFromU8(files[CAPABILITY_MANIFEST_FILE]!)) as Record<string, unknown>;
  files[CAPABILITY_MANIFEST_FILE] = strToU8(JSON.stringify({ ...raw, version }, null, 2));
  return zipSync(files);
}
