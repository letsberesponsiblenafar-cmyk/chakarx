const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename, load = Module._load;
let planner, hooks = [], index = 0, calls = [];
Module._resolveFilename = function(request, parent, isMain, options) { return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options); };
Module._load = function(request, parent, isMain) {
  if (request === 'react') return { ...React, useState(initial) { const key = index++; if (!(key in hooks)) hooks[key] = initial; return [hooks[key], value => { hooks[key] = typeof value === 'function' ? value(hooks[key]) : value; }]; } };
  if (request === '@/components/PlannerProvider') return { usePlanner: () => planner };
  if (['next/link','@/components/AppShell','@/components/PlannerChrome'].includes(request)) return { __esModule: true, default: () => null };
  return load.call(this, request, parent, isMain);
};
for (const extension of ['.ts','.tsx']) require.extensions[extension] = function(module, filename) { module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename); };
require.extensions['.css'] = () => {};
const { destinations } = require('../lib/data.ts');
const { createPlan } = require('../lib/itinerary.ts');
const { tripActivities } = require('../lib/activities.ts');
const Page = require('../app/planner/activities-transport/page.tsx').default;
const input = { name: 'Services QA', arrival: '2026-11-01', departure: '2026-11-06', arrivalTime:'09:00', departureTime:'18:00', pickup:'Jammu', adults:2, youngAges:[], budget:0, hotelCategory:'Signature', packagePreferences:['Signature','Signature Plus'], transport:'Sedan', mealPlan:'Breakfast Only', style:'Balanced', interests:[] };
const catalog = destinations.map(item => ({ ...item, enabled_activities: item.activities }));
function reset() {
  hooks = []; calls = [];
  planner = { input, plan:createPlan(input,catalog), hydrated:true, destinationCatalog:catalog, destinationConnection:'ready',
    costModel:{ transportDaily:3000, transportIsCustom:false, activityCosts:{unrelated:123}, activitySelections:{unrelated:true}, manualInclusions:[], manualExclusions:[] },
    setCostModel(patch) { calls.push(['setCostModel',patch]); planner.costModel = { ...planner.costModel,...patch }; },
    ...Object.fromEntries(['setTransport','setCustomTransport','setPackageTransport','setPackageTransportRate'].map(name => [name,(...args)=>calls.push([name,...args])])) };
  return render();
}
function render() { index = 0; return Page(); }
function all(node, predicate) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(item => all(item,predicate)); return [...(predicate(node) ? [node] : []),...all(node.props?.children,predicate)]; }
function text(node) { if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(text).join(''); return typeof node === 'object' ? text(node.props?.children) : String(node); }
const label = (tree,name) => all(tree,node=>node.props?.['aria-label']===name)[0];
const button = (tree,name) => all(tree,node=>node.type==='button'&&text(node).trim()===name)[0];
let passed = 0;
function check(name,run) { run(); passed++; console.log('PASS '+name); }
check('destinations collapse independently while search opens matching activity groups',()=>{
  let tree = reset(); let groups = all(tree,node=>node.type==='details'&&node.props.className==='activity-cost-group');
  assert(groups.length>1); assert.equal(groups[0].props.open,true); assert(groups.slice(1).every(group=>!group.props.open));
  label(tree,'Search trip activities').props.onChange({target:{value:'Gulmarg'}}); tree=render();
  groups=all(tree,node=>node.type==='details'&&node.props.className==='activity-cost-group');
  assert.equal(groups.length,1); assert.equal(groups[0].props.open,true); assert.match(text(groups[0]),/Gulmarg/);
});
check('include and price actions preserve other costs and allow complimentary activities',()=>{
  let tree=reset(); const activity=tripActivities(planner.plan,catalog)[0];
  label(tree,`Include ${activity.name}`).props.onChange({target:{checked:true}}); tree=render();
  assert.equal(planner.costModel.activitySelections[activity.key],true);
  const price=label(tree,`${activity.name} group cost`); assert.equal(price.props.disabled,false); assert.equal(price.props['aria-invalid'],true);
  price.props.onChange({target:{value:'0'}}); tree=render();
  assert.equal(label(tree,`${activity.name} group cost`).props['aria-invalid'],false);
  assert.equal(planner.costModel.activityCosts[activity.key],0); assert.equal(planner.costModel.activityCosts.unrelated,123);
  button(tree,'Included 1').props.onClick(); tree=render();
  assert.equal(all(tree,node=>node.props?.className==='activity-cost-row selected').length,1);
});
check('excluding and undoing an activity retain their established PDF semantics',()=>{
  let tree=reset(); const activity=tripActivities(planner.plan,catalog)[0];
  label(tree,`Add ${activity.name} to exclusions`).props.onClick(); tree=render();
  assert.equal(planner.costModel.activitySelections[activity.key],false);
  button(tree,'Excluded 1').props.onClick(); tree=render();
  assert.equal(all(tree,node=>node.props?.className==='activity-cost-row').length,1);
  label(tree,`Remove ${activity.name} from exclusions`).props.onClick();
  assert.equal(planner.costModel.activitySelections[activity.key],undefined);
});
check('default and optional package vehicles keep their original independent actions',()=>{
  const tree=reset();
  label(tree,'Choose your vehicle').props.onChange({target:{value:'Innova'}});
  label(tree,'Choose your vehicle').props.onChange({target:{value:'Other'}});
  label(tree,'Vehicle cost per day').props.onChange({target:{value:'4500'}});
  button(tree,'Add vehicle option').props.onClick();
  assert.deepEqual(calls.slice(0,2),[['setTransport','Innova'],['setCustomTransport','']]);
  assert.equal(planner.costModel.transportDaily,4500);
  assert.deepEqual(calls.slice(-2),[['setPackageTransport','Signature Plus','Sedan',false],['setPackageTransportRate','Signature Plus',3000]]);
});
check('additional client inclusions and exclusions still add, edit and remove independently',()=>{
  let tree=reset(); button(tree,'Add inclusion').props.onClick(); button(tree,'Add exclusion').props.onClick(); tree=render();
  label(tree,'Additional inclusion 1').props.onChange({target:{value:'Welcome dinner'}});
  label(tree,'Additional exclusion 1').props.onChange({target:{value:'Flights'}}); tree=render();
  assert.deepEqual(planner.costModel.manualInclusions,['Welcome dinner']); assert.deepEqual(planner.costModel.manualExclusions,['Flights']);
  label(tree,'Remove inclusion 1').props.onClick(); label(tree,'Remove exclusion 1').props.onClick();
  assert.deepEqual(planner.costModel.manualInclusions,[]); assert.deepEqual(planner.costModel.manualExclusions,[]);
});
console.log(`Services UI: ${passed} interaction regressions passed.`);
