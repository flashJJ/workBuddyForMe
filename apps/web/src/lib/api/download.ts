import { ApiClientError, withManagedHeaders } from './client';

/**
 * 带启动令牌下载 API 资源。
 * 桌面端直接导航（location.href / <a href>）不会带 X-WBFM-Token，会变成 401 JSON 页面；
 * 统一改为 fetch + Blob 落盘（v2.16）。
 */
export async function downloadApiFile(url: string, fallbackName: string): Promise<void> {
  const response = await fetch(url, { headers: withManagedHeaders().headers });
  if (!response.ok) {
    throw new ApiClientError('DOWNLOAD_FAILED', `下载失败（HTTP ${response.status}）`, response.status);
  }
  const blob = await response.blob();
  const filename =
    /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
