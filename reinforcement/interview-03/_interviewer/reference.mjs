export function mergeUpdates(rows,updates) {
  const latest=new Map(rows.map(row=>[row.id,row]));
  const ignored=[];
  for(const update of updates) {
    const current=latest.get(update.id);
    if(!current||update.version<=current.version)ignored.push(update.id);
    else latest.set(update.id,update);
  }
  return {rows:rows.map(row=>latest.get(row.id)),ignored};
}
