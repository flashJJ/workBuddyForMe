import { SettingsPage as SettingsPageFeature } from '@/features/settings/settings-page';

export default function SettingsPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const autoCreateCard = searchParams?.new === 'card';
  return <SettingsPageFeature autoCreateCard={autoCreateCard} />;
}
