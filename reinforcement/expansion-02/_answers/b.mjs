export function nextTarget(items,currentId,command) {
  if(!['next','previous','first','last'].includes(command)) throw new RangeError('Unknown command');
  const ids=items.filter(x=>!x.disabled).map(x=>x.id);
  if(!ids.length)return null;
  if(command==='first')return ids[0];
  if(command==='last')return ids.at(-1);
  const at=ids.indexOf(currentId);
  if(at<0)return command==='next'?ids[0]:ids.at(-1);
  return ids[(at+(command==='next'?1:-1)+ids.length)%ids.length];
}
