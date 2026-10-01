export function selectStops(stops, filters = {}) {
  const status = filters.status ?? 'all';
  if (!['all','pending','delivered','failed'].includes(status)) throw new RangeError('Unknown status');
  const search = (filters.search ?? '').trim().toLowerCase();
  return stops.filter(stop => (status === 'all' || stop.status === status) && stop.label.toLowerCase().includes(search));
}
