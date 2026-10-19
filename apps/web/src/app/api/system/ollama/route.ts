import { probeLocalOllama } from '@wbfm/core/services';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** v2.4 M1：向导「提前探测」本机 Ollama（无副作用、不落库，失败返回 false 而非报错） */
export const GET = defineRoute(async () => jsonOk({ available: await probeLocalOllama() }));
