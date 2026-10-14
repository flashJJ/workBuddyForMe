'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { MeetingRoom } from '@/features/meetings/meeting-room';

export default function Page() {
  const params = useParams<{ id: string }>();
  const [id, setId] = React.useState<string | null>(null);
  React.useEffect(() => setId(params.id ?? null), [params.id]);
  if (!id) return null;
  return <MeetingRoom meetingId={id} />;
}
