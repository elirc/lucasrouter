import test from 'node:test';
import assert from 'node:assert/strict';
const subject = await import(process.argv.includes('--reference') ? '../_answers/reference.mjs' : './exercise.mjs');
const {selectStops} = subject;
const stops = Object.freeze([
  Object.freeze({id:'A',label:'Alpha depot',status:'pending'}),
  Object.freeze({id:'B',label:'Beta shop',status:'delivered'}),
  Object.freeze({id:'C',label:'Alpha office',status:'failed'}),
]);
test('default returns all in source order and a new array',()=>{const r=selectStops(stops); assert.deepEqual(r,stops); assert.notEqual(r,stops);});
test('status and normalized search combine with AND',()=>assert.deepEqual(selectStops(stops,{status:'pending',search:' ALPHA '}).map(s=>s.id),['A']));
test('matching objects keep identity',()=>assert.equal(selectStops(stops,{search:'shop'})[0],stops[1]));
test('empty, whitespace, and no match are distinct valid cases',()=>{assert.deepEqual(selectStops([]),[]);assert.equal(selectStops(stops,{search:'  '}).length,3);assert.deepEqual(selectStops(stops,{status:'delivered',search:'alpha'}),[]);});
test('unsupported status is rejected',()=>assert.throws(()=>selectStops(stops,{status:'done'}),RangeError));
test('filters and records remain unchanged',()=>{const f=Object.freeze({status:'failed',search:'office'});assert.equal(selectStops(stops,f)[0],stops[2]);assert.equal(stops[0].id,'A');});
