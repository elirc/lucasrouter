import type { Metadata } from 'next';

import { DispatchScreen } from '@/components/dispatch/DispatchScreen';

export const metadata: Metadata = {
  title: 'Dispatcher — RouteIQ',
  description: 'Map every stop, run the optimizer, and reassign deliveries between drivers.',
};

/** `/dispatch` — thin server shell; all interactivity lives in DispatchScreen (client). */
export default function DispatchPage() {
  return <DispatchScreen />;
}
