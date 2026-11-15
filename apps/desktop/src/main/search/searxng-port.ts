import net from 'node:net';

/** 端口探测与挑选（从 search-ipc 拆出，控制单文件行数） */
export const CANDIDATE_PORTS = [8080, 8090, 8088, 8888];

/** 端口是否真的可用：能 bind 且没人 accept（Windows 上 0.0.0.0 被占时 bind 127.0.0.1 仍可能成功） */
export async function portAvailable(port: number): Promise<boolean> {
  const bindable = await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
  if (!bindable) return false;
  return !(await acceptsConnection(port));
}

function acceptsConnection(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(300);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** 在 127.0.0.1 上找一个真的空闲端口（候选都占用时让系统分配） */
export async function defaultPickPort(): Promise<number> {
  for (const port of CANDIDATE_PORTS) {
    if (await portAvailable(port)) return port;
  }
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('无法分配端口'))));
    });
  });
}
