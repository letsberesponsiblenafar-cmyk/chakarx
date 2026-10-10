'use client';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import DestinationEditor from '@/components/DestinationEditor';
import { usePlanner } from '@/components/PlannerProvider';
import type { Destination } from '@/lib/data';

export default function NewDestinationPage() {
  const router = useRouter();
  const { refreshDestinations } = usePlanner();
  async function saved(record: Destination) {
    await refreshDestinations();
    router.push(`/library/${encodeURIComponent(record.id || record.name)}`);
  }
  return <AppShell><DestinationEditor onSaved={saved}/></AppShell>;
}
