/**
 * Win32 顶层窗口枚举（v3.0 P1 窗口坐立）。
 *
 * 仅 Windows：用 koffi 动态加载 user32/dwmapi，枚举可见顶层窗口的 DWM 扩展边框
 * （去掉不可见的缩放边），并过滤自身进程、最小化、工具窗、点击穿透/半透明层。
 * 非 Windows 或 FFI 加载失败一律返回空数组，调用方降级为「不坐窗口」。
 */
import { screen } from 'electron';
import koffi, { type TypeObject } from 'koffi';

export interface WindowEdge {
  handle: number;
  /** DIP 坐标（已从 Win32 物理像素转换） */
  rect: { x: number; y: number; width: number; height: number };
}

export interface ListWindowEdgesOptions {
  /** 默认 process.pid：跳过自身进程的窗口 */
  ownPid?: number;
  /** Win32 物理像素 → Electron DIP；测试可注入 identity */
  toDip?: (point: { x: number; y: number }) => { x: number; y: number };
}

type NativeFn = (...args: unknown[]) => unknown;

interface Win32Api {
  EnumWindows: NativeFn;
  EnumWindowsProc: TypeObject;
  GetWindowRect: NativeFn;
  IsWindowVisible: NativeFn;
  IsIconic: NativeFn;
  GetWindowLongPtrW: NativeFn;
  GetWindowThreadProcessId: NativeFn;
  GetLayeredWindowAttributes: NativeFn;
  DwmGetWindowAttribute: NativeFn;
}

const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;
const WS_EX_LAYERED = 0x00080000;
const LWA_ALPHA = 0x2;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;
const LAYERED_ALPHA_MIN = 230;
const MIN_WIDTH = 80;
const MIN_HEIGHT = 40;

let apiCache: Win32Api | null | undefined;

function getApi(): Win32Api | null {
  if (apiCache !== undefined) return apiCache;
  if (process.platform !== 'win32') {
    apiCache = null;
    return null;
  }
  try {
    const user32 = koffi.load('user32.dll');
    const dwmapi = koffi.load('dwmapi.dll');
    apiCache = {
      EnumWindows: user32.func('bool __stdcall EnumWindows(void *lpEnumFunc, intptr_t lParam)'),
      EnumWindowsProc: koffi.proto('bool __stdcall EnumWindowsProc(void *hwnd, intptr_t lParam)'),
      GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hwnd, _Out_ void *rect)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void *hwnd)'),
      IsIconic: user32.func('bool __stdcall IsIconic(void *hwnd)'),
      GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)'),
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ void *pid)',
      ),
      GetLayeredWindowAttributes: user32.func(
        'bool __stdcall GetLayeredWindowAttributes(void *hwnd, _Out_ void *key, _Out_ void *alpha, _Out_ void *flags)',
      ),
      DwmGetWindowAttribute: dwmapi.func(
        'long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, _Out_ void *value, uint32_t size)',
      ),
    };
  } catch {
    apiCache = null;
  }
  return apiCache;
}

function readPhysicalRect(api: Win32Api, hwnd: unknown, buf: Buffer): boolean {
  // DWM 扩展边框去掉 Windows 10+ 的不可见缩放边；失败回落 GetWindowRect
  if (Number(api.DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, buf, 16)) === 0) {
    return true;
  }
  return Boolean(api.GetWindowRect(hwnd, buf));
}

function isCloaked(api: Win32Api, hwnd: unknown): boolean {
  const buf = Buffer.alloc(4);
  if (Number(api.DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, buf, 4)) !== 0) return false;
  return buf.readInt32LE(0) !== 0;
}

function isFadedLayeredWindow(api: Win32Api, hwnd: unknown, exStyle: number): boolean {
  if ((exStyle & WS_EX_LAYERED) === 0) return false;
  const key = Buffer.alloc(4);
  const alpha = Buffer.alloc(1);
  const flags = Buffer.alloc(4);
  if (!api.GetLayeredWindowAttributes(hwnd, key, alpha, flags)) return false;
  return (flags.readUInt32LE(0) & LWA_ALPHA) !== 0 && alpha[0]! < LAYERED_ALPHA_MIN;
}

/** 枚举可作为「坐面」的顶层窗口（DIP）；失败返回空数组 */
export function listWindowEdges(options: ListWindowEdgesOptions = {}): WindowEdge[] {
  const api = getApi();
  if (!api) return [];
  const ownPid = options.ownPid ?? process.pid;
  const toDip = options.toDip ?? ((point) => screen.screenToDipPoint(point));
  const edges: WindowEdge[] = [];
  const rectBuf = Buffer.alloc(16);
  const pidBuf = Buffer.alloc(4);

  let callback: bigint | null = null;
  try {
    callback = koffi.register((hwnd: unknown) => {
      if (!api.IsWindowVisible(hwnd) || api.IsIconic(hwnd)) return true;
      const exStyle = Number(api.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
      if ((exStyle & WS_EX_TOOLWINDOW) !== 0 || (exStyle & WS_EX_NOACTIVATE) !== 0) return true;
      api.GetWindowThreadProcessId(hwnd, pidBuf);
      if (pidBuf.readUInt32LE(0) === ownPid) return true;
      if (isCloaked(api, hwnd) || isFadedLayeredWindow(api, hwnd, exStyle)) return true;
      if (!readPhysicalRect(api, hwnd, rectBuf)) return true;

      const left = rectBuf.readInt32LE(0);
      const top = rectBuf.readInt32LE(4);
      const right = rectBuf.readInt32LE(8);
      const bottom = rectBuf.readInt32LE(12);
      if (right - left < MIN_WIDTH || bottom - top < MIN_HEIGHT) return true;

      const tl = toDip({ x: left, y: top });
      const br = toDip({ x: right, y: bottom });
      const x = Math.min(tl.x, br.x);
      const y = Math.min(tl.y, br.y);
      const width = Math.abs(br.x - tl.x);
      const height = Math.abs(br.y - tl.y);
      if (width < MIN_WIDTH || height < MIN_HEIGHT) return true;
      edges.push({ handle: Number(koffi.address(hwnd)), rect: { x, y, width, height } });
      return true;
    }, koffi.pointer(api.EnumWindowsProc));
    api.EnumWindows(callback, 0);
  } catch {
    // 枚举中途失败：保留已收集的部分结果
  } finally {
    if (callback !== null) {
      try {
        koffi.unregister(callback);
      } catch {
        /* ignore */
      }
    }
  }
  return edges;
}
