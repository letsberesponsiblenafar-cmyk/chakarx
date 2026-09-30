import fs from 'node:fs';
import assert from 'node:assert/strict';
const d=JSON.parse(fs.readFileSync(new URL('../data/destinations.json', import.meta.url)));
assert.equal(d.length,44,'Destination count must remain 44');
for(const x of d){
  assert.ok(x.description?.trim(),`${x.name} missing description`);
  for(const k of ['min_days','ideal_days','max_days','min_nights','ideal_nights','max_nights']) assert.equal(typeof x[k],'number',`${x.name} missing ${k}`);
  assert.ok(!('min_hours' in x)&&!('ideal_hours' in x)&&!('max_hours' in x),`${x.name} still has hour fields`);
  assert.ok(Array.isArray(x.local_sightseeing)&&x.local_sightseeing.length>=2,`${x.name} missing local sightseeing`);
  assert.ok(Array.isArray(x.things_to_do)&&x.things_to_do.length>=2,`${x.name} missing things to do`);
  assert.ok(Array.isArray(x.activities)&&x.activities.length>=2,`${x.name} missing activities`);
  assert.ok(x.min_days<=x.ideal_days&&x.ideal_days<=x.max_days,`${x.name} invalid day window`);
  if(x.overnight_allowed) assert.ok(x.min_nights<=x.ideal_nights&&x.ideal_nights<=x.max_nights,`${x.name} invalid night window`);
}
// The private hotel master moved to Supabase. Its live count is checked in the
// admin dashboard; there must not be a second, stale copy in the repository.
console.log(JSON.stringify({ok:true,destinations:d.length,localSightseeing:d.reduce((n,x)=>n+x.local_sightseeing.length,0),hotelMaster:'Supabase'},null,2));
