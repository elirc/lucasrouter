import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DriverRouteScreen } from '@/components/driver/DriverRouteScreen';
import { DRIVERS } from '@/data';

export const metadata: Metadata = {
  title: 'My route · RouteIQ',
  description: 'Follow your delivery route stop by stop and mark each one delivered or failed.',
};

interface DriverRoutePageProps {
  /** Next 16: route params are a Promise. */
  params: Promise<{ id: string }>;
}

/**
 * The roster is static, so prerender the three driver pages. Besides being
 * faster to serve, a prerendered page has its whole <head> assembled before
 * it is sent — a dynamically streamed page flushes </head> before the body
 * render reaches `MapSkeleton`, and the OSM `preconnect` and the placeholder
 * image preload it hoists would then be dropped instead of emitted.
 */
export function generateStaticParams(): { id: string }[] {
  return DRIVERS.map((d) => ({ id: d.id }));
}

/**
 * `/driver/[id]` — server wrapper that resolves params and renders the client
 * screen. Ids that are not in the (static) roster are a real 404 - the client
 * screen keeps its own "Driver not found" state as a belt-and-braces fallback.
 */
export default async function DriverRoutePage({ params }: DriverRoutePageProps) {
  const { id } = await params;
  const driverId = decodeURIComponent(id);
  if (!DRIVERS.some((d) => d.id === driverId)) notFound();
  return <DriverRouteScreen driverId={driverId} />;
}
