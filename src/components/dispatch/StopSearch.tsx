'use client';

import { Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { shortAddress } from '@/lib/geo';
import { StatusPill } from '@/components/ui/StatusPill';

export function StopSearch({ children, onActivateStop }: { children: ReactNode; onActivateStop: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const stops = useAppStore(s => s.stops);
  const matches = useMemo(() => stops.filter(stop =>
    (status === 'all' || stop.status === status) &&
    (!deferredQuery || `${stop.address} ${stop.recipient} ${stop.id}`.toLowerCase().includes(deferredQuery)),
  ), [stops, status, deferredQuery]);
  const filtering = query.trim() !== '' || status !== 'all';
  return (
    <div className="space-y-3">
      <div className="stop-search">
        <Search size={16} aria-hidden="true" />
        <input aria-label="Search stops" placeholder="Search address, recipient, or stop…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }} />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}
      </div>
      <div className="stop-filter-row"><span>{filtering ? 'Matching stops' : 'Today’s routes'}</span><select aria-label="Filter stops by status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="delivered">Delivered</option><option value="failed">Failed</option></select></div>
      {filtering ? <section aria-label="Search results" aria-busy={query.trim().toLowerCase() !== deferredQuery}>
        <p className="mb-2 text-xs text-slate-500" role="status">{matches.length} {matches.length === 1 ? 'stop' : 'stops'} found</p>
        {matches.length ? <ol className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">{matches.map(stop => <li key={stop.id}><button type="button" className="flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 focus-visible:-outline-offset-2" onClick={() => onActivateStop(stop.id)}><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{shortAddress(stop.address)}</strong><span className="block truncate text-xs text-slate-500">{stop.recipient} · {stop.id}</span></span><StatusPill status={stop.status} /></button></li>)}</ol> : <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center"><p className="font-medium">No matching stops</p><p className="mt-1 text-xs text-slate-500">Try another address or change the status filter.</p><button type="button" className="mt-3 min-h-11 text-sm font-medium text-emerald-800 underline" onClick={() => { setQuery(''); setStatus('all'); }}>Clear filters</button></div>}
      </section> : children}
    </div>
  );
}
