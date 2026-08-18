'use client';

// The single depot: slate square marker with a hover tooltip and a small popup.

import { memo, useMemo } from 'react';
import { Marker, Popup, Tooltip } from 'react-leaflet';
import type { Depot } from '@/lib/types';
import { depotIcon } from './icons';

export interface DepotMarkerProps {
  depot: Depot;
}

function DepotMarkerImpl({ depot }: DepotMarkerProps) {
  const position = useMemo<[number, number]>(() => [depot.lat, depot.lng], [depot.lat, depot.lng]);
  const icon = useMemo(() => depotIcon(), []);

  return (
    <Marker
      position={position}
      icon={icon}
      alt={`${depot.name} (Depot)`}
      title={`${depot.name} (Depot)`}
      keyboard
      zIndexOffset={500}
    >
      <Tooltip direction="top" offset={[0, -4]}>
        <span className="text-xs font-medium text-slate-900">{depot.name}</span>{' '}
        <span className="text-xs text-slate-500">(Depot)</span>
      </Tooltip>
      <Popup className="riq-popup" maxWidth={260} minWidth={180}>
        <div className="space-y-0.5 text-sm text-slate-900">
          <p className="pr-6 font-medium leading-snug">{depot.name}</p>
          <p className="text-xs text-slate-600">{depot.address}</p>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Depot · start &amp; end of every route</p>
        </div>
      </Popup>
    </Marker>
  );
}

export const DepotMarker = memo(DepotMarkerImpl);
DepotMarker.displayName = 'DepotMarker';
