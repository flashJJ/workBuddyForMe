import type { FsLike } from './downloader-types';

/** 生产环境文件系统（动态引用 node:fs） */
export const defaultFs: FsLike = {
  async mkdir(dir, options) {
    const fs = await import('node:fs/promises');
    return fs.mkdir(dir, options);
  },
  async stat(p) {
    const fs = await import('node:fs/promises');
    try {
      return await fs.stat(p);
    } catch {
      return null;
    }
  },
  async rename(oldPath, newPath) {
    const fs = await import('node:fs/promises');
    return fs.rename(oldPath, newPath);
  },
  async rm(p, options) {
    const fs = await import('node:fs/promises');
    return fs.rm(p, options);
  },
  async openWrite(p, options) {
    const fs = await import('node:fs/promises');
    const handle = await fs.open(p, options.append ? 'a' : 'w');
    return {
      async write(data) {
        let offset = 0;
        while (offset < data.length) {
          const { bytesWritten } = await handle.write(data, offset, data.length - offset);
          offset += bytesWritten;
        }
      },
      async close() {
        await handle.close();
      },
    };
  },
  async openRead(p) {
    const fs = await import('node:fs');
    return fs.createReadStream(p);
  },
};
