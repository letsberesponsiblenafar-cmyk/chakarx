import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = 32000 + process.pid % 10000;
const base = `http://127.0.0.1:${port}`;
const secret = 'local-route-regression-secret-at-least-32-characters';
const expiry = String(Math.floor(Date.now() / 1000) + 3600);
const token = `${expiry}.${createHmac('sha256', secret).update(expiry).digest('hex')}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, CHAKAR_ADMIN_USER: 'route-check', CHAKAR_ADMIN_PASSWORD_HASH: 'test:00', CHAKAR_SESSION_SECRET: secret },
  stdio: 'ignore',
});

function input(days, arrival = '2026-10-05') {
  const end = new Date(`${arrival}T12:00:00`);
  end.setDate(end.getDate() + days - 1);
  return {
    name: 'Route check', arrival, departure: end.toISOString().slice(0, 10), arrivalTime: '06:00', pickup: 'Srinagar',
    adults: 2, youngAges: [], budget: 60000, hotelCategory: 'Signature', transport: 'Ertiga',
    mealPlan: 'Breakfast & Dinner', style: 'Balanced', interests: ['Nature'],
  };
}

async function planFor(days, arrival) {
  const response = await fetch(`${base}/api/itinerary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `chakar_admin=${token}` },
    body: JSON.stringify({ input: input(days, arrival) }),
  });
  if (!response.ok) throw new Error(`API failed for ${days} days: ${response.status} ${await response.text()}`);
  return (await response.json()).plan;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Local production server did not start');

  const protectedPath = '/library/Sinthan%20Top/edit?review=1';
  const unauthenticated = await fetch(`${base}${protectedPath}`, { redirect: 'manual' });
  assert.equal(unauthenticated.status, 307);
  assert.equal(new URL(unauthenticated.headers.get('location'), base).searchParams.get('next'), protectedPath);
  const signedInReturn = await fetch(`${base}/login?next=${encodeURIComponent(protectedPath)}`, { redirect: 'manual', headers: { Cookie: `chakar_admin=${token}` } });
  // Next can stream an authenticated server-component redirect after sending 200.
  let returnLocation = signedInReturn.headers.get('location');
  if (!returnLocation) {
    assert.equal(signedInReturn.status, 200);
    const html = await signedInReturn.text();
    returnLocation = html.match(/<meta[^>]+http-equiv="refresh"[^>]+content="[^;]+;url=([^"]+)"/)?.[1];
    assert.ok(returnLocation, 'The streamed login response must redirect to the requested page.');
  } else assert.equal(signedInReturn.status, 307);
  assert.equal(new URL(returnLocation, base).pathname, '/library/Sinthan%20Top/edit');
  assert.equal(new URL(returnLocation, base).search, '?review=1');
  console.log('Sign-in return navigation retains the requested page and query.');

  const cronReject = await fetch(`${base}/api/cron/sync`, { headers: { Authorization: 'Bearer invalid-secret' } });
  assert.equal(cronReject.status, 401);
  assert.match((await cronReject.json()).error, /Unauthorized cron request/, 'Bearer cron requests must reach the handler instead of the admin-cookie gate');

  for (const overrides of [{ arrival: '2026-02-30' }, { departure: '2026-11-31' }, { adults: 1.5 }, { youngAges: [5.5] }]) {
    const invalidInput = { ...input(5), ...overrides };
    const origin = `http://localhost:${port}`;
    const headers = { 'Content-Type': 'application/json', Cookie: `chakar_admin=${token}`, Origin: origin, Host: new URL(origin).host };
    const generated = await fetch(`${base}/api/itinerary`, { method: 'POST', headers, body: JSON.stringify({ input: invalidInput }) });
    assert.equal(generated.status, 400, `Generation must reject ${JSON.stringify(overrides)} before reading live libraries.`);
    const saved = await fetch(`${base}/api/itineraries`, { method: 'POST', headers,
      body: JSON.stringify({ snapshot: { input: invalidInput, plan: { input: invalidInput } }, total: 0, downloaded: false }) });
    assert.equal(saved.status, 400, `Saving must reject ${JSON.stringify(overrides)} without writing to the database.`);
  }
  console.log('Generation and saving reject impossible calendar dates and fractional travellers/ages.');

  const short = await planFor(4);
  assert.deepEqual(short.dayPlans.slice(0, -1).map((day) => day.stay), ['Srinagar', 'Srinagar', 'Srinagar']);
  assert.deepEqual(short.dayPlans.map((day) => day.dayTripDestination).filter(Boolean), ['Gulmarg', 'Pahalgam', 'Sonamarg']);
  assert.match(short.dayPlans[0].notes.join(' '), /early arrival/i);

  const five = await planFor(5);
  assert.deepEqual(five.dayPlans.slice(0, -1).map((day) => day.stay), Array(4).fill('Srinagar'));
  assert.equal(five.dayPlans[0].dayTripDestination, undefined, 'Five days should not depend on an arrival-day mountain excursion');
  assert.deepEqual(five.dayPlans.slice(1, -1).map((day) => day.dayTripDestination), ['Gulmarg', 'Pahalgam', 'Sonamarg']);

  const six = await planFor(6);
  assert.deepEqual(six.dayPlans.slice(0, -1).map((day) => day.stay), ['Srinagar', 'Gulmarg', 'Srinagar', 'Srinagar', 'Srinagar']);
  assert.deepEqual(six.dayPlans.slice(3, -1).map((day) => day.dayTripDestination), ['Pahalgam', 'Sonamarg']);

  for (const days of [7, 8]) {
    const plan = await planFor(days);
    for (const name of ['Gulmarg', 'Pahalgam']) assert.ok(plan.hotelPlans.some((stay) => stay.location === name), `${days} days misses ${name}`);
    assert.ok(plan.dayPlans.some((day) => day.stay === 'Sonamarg' || day.dayTripDestination === 'Sonamarg'), `${days} days misses Sonamarg`);
    assert.ok(plan.dayPlans.slice(1, -1).every((day) => day.from === 'Srinagar' || day.stay === 'Srinagar' || day.from === day.stay), `${days} days contains a rushed cross-valley hotel transfer`);
    assert.equal(plan.dayPlans.at(-1).to, 'Srinagar');
  }

  const ten = await planFor(10);
  assert.ok(ten.dayPlans.some((day) => day.stay === 'Doodhpathri' || day.dayTripDestination === 'Doodhpathri'));
  assert.ok(ten.dayPlans.some((day) => day.dayTripDestination === 'Naranag'), 'Ten days must retain its extra excursion instead of consuming every day with hotel transfers.');
  assert.ok(ten.dayPlans.slice(1, -1).every((day) => day.from === 'Srinagar' || day.stay === 'Srinagar' || day.from === day.stay), 'Doodhpathri must not create a cross-valley overnight transfer');

  const eleven = await planFor(11);
  assert.ok(eleven.hotelPlans.some((stay) => stay.location === 'Doodhpathri'));
  assert.ok(eleven.dayPlans.some((day) => day.dayTripDestination === 'Naranag'), 'Spare Srinagar day should visit Naranag');

  const sixteen = await planFor(16);
  assert.ok(sixteen.hotelPlans.some((stay) => ['Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri'].includes(stay.location) && stay.nights > 1), 'Extended trip should lengthen a core stay');

  const winter = await planFor(10, '2027-01-05');
  assert.ok(!winter.hotelPlans.some((stay) => stay.location === 'Doodhpathri'), 'Winter must not automatically add Doodhpathri overnight');

  for (let days = 2; days <= 31; days++) {
    const plan = await planFor(days);
    const overnightDays = plan.dayPlans.slice(0, -1);
    assert.equal(plan.dayPlans.length, days, `${days}-day plan has wrong day count`);
    assert.equal(plan.hotelPlans.reduce((sum, stay) => sum + stay.nights, 0), days - 1, `${days}-day plan has wrong hotel-night count`);
    assert.equal(overnightDays[0].stay, 'Srinagar');
    assert.equal(overnightDays.at(-1).stay, 'Srinagar');
    assert.equal(plan.dayPlans.at(-1).to, 'Srinagar');
  }

  console.log('Route checks passed for key trip lengths, winter fallback and every duration from 2 to 31 days.');
} finally {
  server.kill();
}
