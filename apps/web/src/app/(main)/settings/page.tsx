import { SettingsPage as SettingsPageFeature } from '@/features/settings';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const autoCreateCard = params?.new === 'card';
  return <SettingsPageFeature autoCreateCard={autoCreateCard} />;
}
