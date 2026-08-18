import type { Metadata } from 'next';

import { DriverPicker } from '@/components/driver/DriverPicker';

export const metadata: Metadata = {
  title: 'Driver app · RouteIQ',
  description: 'Pick your name to follow your delivery route stop by stop.',
};

/** `/driver` — thin server wrapper around the client picker screen. */
export default function DriverPickerPage() {
  return <DriverPicker />;
}
