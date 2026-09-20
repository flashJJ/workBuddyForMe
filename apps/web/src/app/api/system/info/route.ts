import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { getDataRoot } from '@wbfm/config';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(() =>
  jsonOk({
    dataDir: getDataRoot(),
    version: process.env.npm_package_version ?? '0.1.0',
  }),
);
