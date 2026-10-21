import { FlowsListPage } from '@/features/flows/flows-list-page';

export default function Page({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const autoCreate = searchParams?.new === '1';
  return <FlowsListPage autoCreate={autoCreate} />;
}
