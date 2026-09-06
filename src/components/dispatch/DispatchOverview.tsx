'use client';

import { CheckCheck, MapPin, Route, Truck } from 'lucide-react';
import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function DispatchOverview() {
  const stops = useAppStore(s => s.stops);
  const drivers = useAppStore(s => s.drivers);
  const metrics = useAppStore(s => s.optimizedMetrics);
  const baseline = useAppStore(s => s.baselineMetrics);
  const done = useMemo(() => stops.filter(s => s.status === 'delivered').length, [stops]);
  const saved = metrics && baseline && baseline.totalDistanceKm > 0
    ? Math.round((1 - metrics.totalDistanceKm / baseline.totalDistanceKm) * 100) : null;
  const cards = [
    { label: 'Delivery stops', value: stops.length, detail: 'Across Madison', icon: MapPin },
    { label: 'Fleet available', value: drivers.length, detail: 'Drivers on the roster', icon: Truck },
    { label: 'Delivered', value: done, detail: `${stops.length - done} still to deliver`, icon: CheckCheck },
    { label: 'Planned distance', value: metrics ? `${Math.round(metrics.totalDistanceKm)} km` : '—', detail: saved === null ? 'Optimize to see your plan' : saved >= 0 ? `${saved}% less than baseline` : `${Math.abs(saved)}% more than baseline`, icon: Route },
  ];
  return (
    <section className="dispatch-overview" aria-label="Fleet overview">
      <div className="overview-heading"><div><p>OPERATIONS / MADISON</p><h1>Dispatch workspace</h1></div><span className="workspace-badge"><span /> Demo workspace</span></div>
      <div className="overview-grid">{cards.map(({ label, value, detail, icon: Icon }) => (
        <div className="overview-card" key={label}><div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div><Icon size={18} aria-hidden="true" /></div>
      ))}</div>
    </section>
  );
}
