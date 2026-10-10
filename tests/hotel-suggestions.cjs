const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function (module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  module._compile(output, filename);
};

const { suggestedHotel } = require('../lib/hotels.ts');
const { hotelRateValidity } = require('../lib/hotel-rate-validity.ts');
const { quoteReadiness, hotelConfirmationSignature } = require('../lib/quote-readiness.ts');
const { syncHotelSelections } = require('../components/PlannerProvider.tsx');
const input = { adults: 2, youngAges: [], hotelCategory: 'Signature' };
const plan = { hotelPlans: [{ location: 'Doodhpathri', nights: 1 }] };
const hotel = (id, normalizedCategory, mapB2B) => ({
  id, name: id, destination: 'Doodhpathri', normalizedCategory, mapB2B,
  extraBedB2B: null, cnbB2B: null, starRating: null, address: '', roomType: '', website: '',
  sourceType: 'Hotel master', availabilityStatus: 'Confirm availability',
});
const unclassified = hotel('unclassified', 'Unspecified', null);
const exact = hotel('signature', '3 Star', 2500);
const dated = { ...exact, rateValidity: '2026-10-01 to 2026-10-31' };
assert.equal(hotelRateValidity(dated, '2026-10-12', '2026-10-15'), 'matching');
assert.equal(hotelRateValidity(dated, '2026-11-12', '2026-11-15'), 'outside');
assert.equal(suggestedHotel('Doodhpathri', 'Signature', [{ ...exact, id: 'unpriced', mapB2B: null }, dated], '2026-10-12', '2026-10-15')?.id, 'signature', 'A rated stay should outrank an unpriced category match');
assert.equal(suggestedHotel('Doodhpathri', 'Signature', [{ ...dated, id: 'expired', rateValidity: 'September 2026' }, { ...dated, id: 'current-alternative', normalizedCategory: '4 Star' }], '2026-10-12', '2026-10-15')?.id, 'current-alternative', 'A current alternative should outrank an expired exact category rate');

assert.equal(suggestedHotel('Doodhpathri', 'Signature', [unclassified])?.id, 'unclassified');
assert.equal(suggestedHotel('Doodhpathri', 'Signature', [unclassified, exact])?.id, 'signature');
const initial = syncHotelSelections(plan, [], [], input);
assert.equal(initial[0].hotelId, '');
const recovered = syncHotelSelections(plan, initial, [unclassified], input);
assert.equal(recovered[0].hotelId, 'unclassified', 'A placeholder must upgrade after reconnection');
assert.match(recovered[0].status, /alternative.*confirm category/i);
const custom = [{ ...initial[0], hotelName: 'Operator chosen stay', status: 'custom hotel name' }];
assert.equal(syncHotelSelections(plan, custom, [unclassified], input)[0].hotelName, 'Operator chosen stay');
assert.equal(syncHotelSelections(plan, recovered, [], input)[0].hotelId, 'unclassified', 'A temporary disconnect must preserve the selection');
const quotePlan = { ...plan, input: { ...input, transport: 'Sedan', mealPlan: 'Breakfast & Dinner' }, nights: 1, dayPlans: [{ date: '2026-10-12', stay: 'Doodhpathri', from: 'Doodhpathri', to: 'Doodhpathri', blocks: [] }] };
const quoteModel = { transportDaily: 3500, activityCosts: {}, activitySelections: {} };
assert.ok(quoteReadiness(quotePlan, [{ ...recovered[0], nightlyRate: 2500, rateConfirmed: false }], quoteModel, [dated], 'ready', 'ready').some((issue) => issue.includes('Verify')));
const confirmed = { ...recovered[0], hotelId: dated.id, nightlyRate: 2500, rateConfirmed: true, status: 'user-edited' };
confirmed.confirmedSignature = hotelConfirmationSignature(quotePlan, confirmed, quotePlan.input.mealPlan);
assert.deepEqual(quoteReadiness(quotePlan, [confirmed], quoteModel, [dated], 'ready', 'ready'), []);
assert.ok(quoteReadiness(quotePlan, [{ ...confirmed, nightlyRate: 0 }], quoteModel, [dated], 'ready', 'ready').some((issue) => issue.includes('positive room rate')), 'A zero room rate must block client download');
assert.ok(quoteReadiness({ ...quotePlan, input: { ...quotePlan.input, mealPlan: 'None' } }, [confirmed], quoteModel, [dated], 'ready', 'ready').some((issue) => issue.includes('Verify')), 'Meal plan changes require rate confirmation again');
console.log('Hotel suggestion recovery, category alternatives and custom selection checks passed.');
