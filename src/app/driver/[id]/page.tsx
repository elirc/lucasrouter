import type { Metadata } from 'next';

import { DriverRouteScreen } from '@/components/driver/DriverRouteScreen';

export const metadata: Metadata = {
  title: 'My route · RouteIQ',
  description: 'Follow your delivery route stop by stop and mark each one delivered or failed.',
};

interface DriverRoutePageProps {
  /** Next 16: route params are a Promise. */
  params: Promise<{ id: string }>;
}

/** `/driver/[id]` — server wrapper that resolves params and renders the client screen. */
export default async function DriverRoutePage({ params }: DriverRoutePageProps) {
  const { id } = await params;
  return <DriverRouteScreen driverId={decodeURIComponent(id)} />;
}
