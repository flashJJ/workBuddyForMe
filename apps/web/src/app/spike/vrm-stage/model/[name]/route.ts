import { notFound } from 'next/navigation';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * v2.0 M0 VRM spike 专用：把 scripts/fixtures/vrm 下的样本喂给门控工装页。
 * 同样受 WBFM_SPIKE=1 门控；文件名白名单 + 固定 fixtures 目录，杜绝路径穿越。
 * 样本刻意不进 public/，不进 next 静态产物与安装包（见 fixtures/vrm/LICENSE.md）。
 */
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['VRM1_Constraint_Twist_Sample.vrm']);

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  if (process.env.WBFM_SPIKE !== '1') notFound();
  const { name } = await ctx.params;
  if (!ALLOWED.has(name)) notFound();
  const file = resolve(process.cwd(), 'scripts', 'fixtures', 'vrm', name);
  if (!existsSync(file)) notFound();
  const buffer = readFileSync(file);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'model/gltf-binary',
      'cache-control': 'no-store',
    },
  });
}
