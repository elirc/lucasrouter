function apply(rows,id,version,value,status) {
  const old=rows.find(r=>r.id===id);
  if(!old) return {status:'missing',rows};
  if(old.version!==version) return {status:'conflict',rows};
  const next={...old,value,version:old.version+1};
  const result={status,rows:rows.map(r=>r.id===id?next:r)};
  if(status==='applied') result.token={id,version:next.version,value:old.value};
  return result;
}
export function edit(rows,c) {return apply(rows,c.id,c.expectedVersion,c.value,'applied');}
export function undo(rows,t) {return apply(rows,t.id,t.version,t.value,'undone');}
