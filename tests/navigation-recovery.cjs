const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
const load = Module._load;
const hooks = [];
let index = 0;
const navigations = [];
const catalogues = [];
const writes = [], removals = [];
const resolvedHotel = { id: 'hotel with spaces', destination: 'Srinagar', name: 'Saved hotel', normalizedCategory: 'Signature' };
Module._resolveFilename = function (request, parent, main, options) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, main, options);
};
Module._load = function (request, parent, main) {
  if (request === 'react') return { ...React, useState(initial) {
    const key = index++;
    if (!(key in hooks)) hooks[key] = typeof initial === 'function' ? initial() : initial;
    return [hooks[key], value => { hooks[key] = typeof value === 'function' ? value(hooks[key]) : value; }];
  } };
  if (request === 'next/navigation') return {
    usePathname: () => '/library',
    useRouter: () => ({ replace: value => navigations.push(value), refresh() {} }),
    redirect: value => { throw new Error(`REDIRECT:${value}`); },
  };
  if (request === '@/components/PlannerProvider') return { usePlanner: () => ({ reset() {}, replaceHotelDatabase: records => catalogues.push(records) }) };
  if (request === '@/lib/admin-auth') return { isAdmin: async () => true, authConfigured: () => true, sameOrigin: request => request.headers.get('origin') === new URL(request.url).origin };
  if (request === '@/lib/hotel-store') return { getHotel: async id => id === 'hotel%20with%20spaces' ? resolvedHotel : null, upsertHotels: async records => writes.push(...records), deleteHotel: async id => removals.push(id) };
  if (request === 'next/link') return { __esModule: true, default: () => null };
  return load.call(this, request, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
require.extensions['.css'] = () => {};
const { loginDestination } = require('../lib/navigation.ts');
const LoginPage = require('../app/login/page.tsx').default;
const HotelEditor = require('../components/HotelEditor.tsx').default;
const AppShell = require('../components/AppShell.tsx').default;
const HotelPage = require('../app/hotels/[id]/page.tsx').default;
const hotelRoute = require('../app/api/hotels/[id]/route.ts');
function render(Component, props = {}) { index = 0; return Component(props); }
function all(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => all(node, predicate));
  return [...(predicate(tree) ? [tree] : []), ...all(tree.props?.children, predicate)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).join('');
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
(async () => {
  for (const value of ['/library/Sinthan%20Top/edit', '/saved-itineraries?client=Neetika', '/library?filter=all#package-defaults-heading']) {
    assert.equal(loginDestination(value), value);
    await assert.rejects(LoginPage({ searchParams: Promise.resolve({ next: value }) }), error => error.message === `REDIRECT:${value}`);
  }
  for (const value of [undefined, ['/', '/hotels'], '//outside.test', '/\\outside.test', '/%5coutside.test', '/%2foutside.test', '/login?next=/login', '/api/auth/logout', '/bad%zz', '/\noutside.test', 'https://outside.test']) assert.equal(loginDestination(value), '/');
  console.log('PASS sign-in preserves internal destinations, filters and fragments and rejects invalid return paths');

  const params = Promise.resolve({ id: 'hotel%20with%20spaces' });
  const hotelPage = await HotelPage({ params });
  assert.equal(all(hotelPage, node => node.type === HotelEditor)[0].key, resolvedHotel.id);
  const patch = await hotelRoute.PATCH(new Request('https://chakar.test/api/hotels/hotel%20with%20spaces', { method: 'PATCH', headers: { Origin: 'https://chakar.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Updated hotel', id: 'wrong-target' }) }), { params });
  assert.equal(patch.status, 200);
  assert.equal(writes[0].id, resolvedHotel.id);
  const removed = await hotelRoute.DELETE(new Request('https://chakar.test/api/hotels/hotel%20with%20spaces', { method: 'DELETE', headers: { Origin: 'https://chakar.test' } }), { params });
  assert.equal(removed.status, 200);
  assert.deepEqual(removals, [resolvedHotel.id]);
  const missing = await hotelRoute.DELETE(new Request('https://chakar.test/api/hotels/missing', { method: 'DELETE', headers: { Origin: 'https://chakar.test' } }), { params: Promise.resolve({id:'missing'}) });
  assert.equal(missing.status, 404);
  assert.equal(removals.length, 1);
  console.log('PASS hotel route editors use record identity and writes target the resolved record only');

  hooks.length = 0;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method });
    if (requests.length === 1) return Response.json({ hotel: { id: 'confirmed-hotel' } });
    if (requests.length === 2) return Response.json({ error: 'Unavailable' }, { status: 503 });
    if (requests.length === 3) return Response.json({ hotel: { id: 'confirmed-hotel' } });
    return Response.json({ hotels: [{ id: 'confirmed-hotel', destination: 'Srinagar', name: 'Test hotel' }] });
  };
  let tree = render(HotelEditor);
  await all(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  tree = render(HotelEditor);
  assert.match(text(tree), /change was saved.*could not be refreshed/);
  assert.equal(navigations.length, 0);
  await all(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.deepEqual(requests.slice(0, 3).map(({url,method}) => [url,method]), [['/api/hotels','POST'],['/api/hotels',undefined],['/api/hotels/confirmed-hotel','PATCH']]);
  assert.deepEqual(navigations, ['/hotels/confirmed-hotel']);
  assert.equal(catalogues.length, 1);
  console.log('PASS hotel refresh failure keeps the editor and retry updates the same confirmed hotel');

  hooks.length = 0;
  const redirects = [];
  global.window = { location: { assign: value => redirects.push(value) } };
  for (const failure of [() => Response.json({error:'Failed'}, {status:503}), () => { throw new Error('Offline'); }]) {
    global.fetch = async () => failure();
    tree = render(AppShell, {children:null});
    await all(tree, node => node.type === 'button' && text(node).includes('Sign out'))[0].props.onClick();
    assert.equal(redirects.length, 0);
    assert.match(text(render(AppShell, {children:null})), /Could not sign out/);
  }
  global.fetch = async () => Response.json({ok:true});
  tree = render(AppShell, {children:null});
  await all(tree, node => node.type === 'button' && text(node).includes('Sign out'))[0].props.onClick();
  assert.deepEqual(redirects, ['/login']);
  console.log('PASS failed logout stays on the page with retry feedback and successful logout navigates');
})().catch(error => { console.error(error); process.exitCode = 1; });
