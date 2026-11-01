import { FlowsListPage } from '@/features/flows';

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const autoCreate = params?.new === '1';
  return <FlowsListPage autoCreate={autoCreate} />;
}
