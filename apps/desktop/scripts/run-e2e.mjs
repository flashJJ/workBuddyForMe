// Electron 冒烟 E2E 一键脚本：构建 → 归集服务 → pack:dir → Playwright
// （electron-builder 二进制下载走国内镜像，规避 GitHub 直连超时）
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');

/**
 * Smart App Control 开启时，Windows 会拦截重打包产生的未签名 exe
 * （hash 每次变化必然命中云端未知判定）。此环境下降级为用官方签名
 * 的 electron.exe 直接加载打包产物 app.asar，配合 WBFM_SERVER_PATH
 * 指向打包内 standalone server，验证链路等价。
 */
function detectSmartAppControl() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-MpComputerStatus).SmartAppControlState"',
      { encoding: 'utf8' },
    ).trim();
    return out === 'On';
  } catch {
    return false;
  }
}

const env = {
  ...process.env,
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
};
if (detectSmartAppControl()) {
  env.WBFM_SAC_BLOCKED = '1';
  console.warn('[run-e2e] 检测到 Smart App Control 已开启：改用官方 electron.exe 加载 app.asar 冒烟');
}

const steps = [
  { cmd: 'pnpm', args: ['--filter', '@wbfm/web', 'build'], cwd: desktopDir },
  { cmd: 'pnpm', args: ['build'], cwd: desktopDir },
  { cmd: 'node', args: ['scripts/prepare-server.mjs'], cwd: desktopDir },
  { cmd: 'pnpm', args: ['exec', 'electron-builder', '--dir', '--x64'], cwd: desktopDir },
  { cmd: 'pnpm', args: ['exec', 'playwright', 'test'], cwd: desktopDir },
];

for (const step of steps) {
  console.log(`\n> ${step.cmd} ${step.args.join(' ')} (${path.relative(desktopDir, step.cwd) || '.'})`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
    cwd: step.cwd,
  });
  if (result.status !== 0) {
    console.error(`步骤失败（exit ${result.status}）：${step.cmd} ${step.args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}
