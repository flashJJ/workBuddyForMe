import { contextBridge } from 'electron';

/**
 * 最小 preload：仅暴露托管服务的 baseUrl 与一次性 token，
 * 不开放任何 Node 能力（sandbox:true 下也只有 polyfilled require）。
 */
function readArg(name: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

const token = readArg('wbfm-token');
const baseUrl = readArg('wbfm-base-url');

contextBridge.exposeInMainWorld('wbfm', {
  token,
  baseUrl,
  isManaged: Boolean(token),
});
