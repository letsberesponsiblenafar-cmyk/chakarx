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
    name: 'Route check', arrival, departure: end.toISOString().slice(0, 10), pickup: 'Srinagar',
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

  const short = await planFor(4);
  assert.deepEqual(short.dayPlans.slice(0, -1).map((day) => day.stay), ['Srinagar', 'Srinagar', 'Srinagar']);
  assert.deepEqual(short.dayPlans.map((day) => day.dayTripDestination).filter(Boolean), ['Gulmarg', 'Pahalgam', 'Sonamarg']);
  assert.match(short.dayPlans[0].notes.join(' '), /early arrival/i);

  const five = await planFor(5);
  assert.deepEqual(five.dayPlans.slice(0, -1).map((day) => day.stay), ['Srinagar', 'Gulmarg', 'Pahalgam', 'Srinagar']);
  assert.equal(five.dayPlans[0].dayTripDestination, 'Sonamarg');
  assert.match(five.dayPlans[0].notes.join(' '), /early arrival/i);

  const six = await planFor(6);
  assert.deepEqual(six.dayPlans.slice(0, -1).map((day) => day.stay), ['Srinagar', 'Gulmarg', 'Pahalgam', 'Srinagar', 'Srinagar']);
  assert.equal(six.dayPlans[4].dayTripDestination, 'Sonamarg');

  for (const days of [7, 8]) {
    const plan = await planFor(days);
    for (const name of ['Gulmarg', 'Pahalgam', 'Sonamarg']) assert.ok(plan.hotelPlans.some((stay) => stay.location === name), `${days} days misses ${name}`);
    assert.ok(plan.dayPlans.some((day) => day.dayTripDestination === 'Naranag'), `${days} days misses Naranag`);
    assert.equal(plan.dayPlans.at(-1).to, 'Srinagar');
  }

  const ten = await planFor(10);
  assert.ok(ten.hotelPlans.some((stay) => stay.location === 'Doodhpathri'));
  assert.ok(ten.dayPlans.some((day) => day.dayTripDestination === 'Naranag'));

  const eleven = await planFor(11);
  assert.ok(eleven.hotelPlans.some((stay) => !['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonamarg', 'Doodhpathri'].includes(stay.location)), 'Longer trip should add a destination');

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
