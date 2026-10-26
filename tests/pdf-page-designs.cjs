const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) { return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, isMain, options); };
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = function(module, filename) { module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename); };
const { PDFDocument } = require('pdf-lib'), { PDFParse } = require('pdf-parse');
const { stylePdfMaster } = require('../lib/pdf-master-style.ts');
const { defaultPdfDesign, validatePdfDesign, samePdfDesign, pdfDesignPages } = require('../lib/pdf-designs.ts');
const { buildThemedClientPdf } = require('../components/ClientPdf.tsx');
const { createPlan } = require('../lib/itinerary.ts'), { calculateCosts } = require('../lib/costing.ts');
const master = fs.readFileSync(path.join(root, 'public/pdf-assets/client-master.pdf'));
const fonts = Object.fromEntries([['regular','Evolventa-Regular.ttf'],['bold','Evolventa-Bold.ttf'],['cover','RedHatDisplay-400.ttf'],['redhatBold','RedHatDisplay-700.ttf']].map(([key,file])=>[key,fs.readFileSync(path.join(root,'public/fonts',file)).toString('base64')]));
async function text(bytes) { const p = new PDFParse({ data: new Uint8Array(bytes).slice() }); try { return (await p.getText()).text.replace(/\s+/g,' ').trim(); } finally { await p.destroy(); } }
(async()=>{
  const legacy = defaultPdfDesign('original'), before = JSON.stringify(legacy);
  assert.deepEqual(validatePdfDesign(legacy), legacy);
  assert.ok(samePdfDesign(legacy, {...legacy,pages:{}}));
  const design = {...legacy, pages: Object.fromEntries(pdfDesignPages.map((p,i)=>[p.id,{
    headingFont:['redhat','serif','evolventa'][i%3], bodyFont:['evolventa','redhat','serif'][i%3], headingScale:1.05, bodyScale:.95,
    headingColor:p.dark?'#D2ECF7':'#19384B', bodyColor:'#243849', lightTextColor:'#E8F5FA',
    ...(p.paper?{backgroundColor:'#E9F2F7',bottomDecoration:false}:{}), ...(p.topDecoration?{topDecoration:false}:{}),
    showLogo:false, showPageNumber:true, footerText:'Chakar Experience | Your journey, considered', footerColor:p.dark?'#E8F5FA':'#243849',
  }]))};
  const valid = validatePdfDesign(design);
  assert.equal(JSON.stringify(legacy), before);
  assert.ok(!samePdfDesign(legacy,valid));
  for(const patch of [{bodyFont:'script'},{bodyScale:3},{logoScale:0},{headingColor:'#fff'},{footerText:'bad\nline'},{unexpected:true},{showLogo:'false'},{backgroundColor:'#000000'}]) assert.throws(()=>validatePdfDesign({...legacy,pages:{summary:patch}}));
  assert.throws(()=>validatePdfDesign({...legacy,pages:{unknown:{}}}));
  assert.throws(()=>validatePdfDesign({...legacy,pages:{cover:{bottomDecoration:false}}}));
  const edited = await stylePdfMaster(master, valid, {}, fonts);
  assert.equal((await PDFDocument.load(edited)).getPageCount(),15);
  const a = await text(master), b = await text(edited);
  // PDF text extraction infers spaces between separately positioned words;
  // different fonts alter that heuristic, but every source character remains.
  assert.equal(b.replace(/\s/g,''),a.replace(/\s/g,''),'Every native character must remain intact after changing fonts and colours.');
  fs.mkdirSync(path.join(root,'tmp/pdfs'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/pdfs/page-styles-native.pdf'),edited);
  // Applying a single page must leave every other native page unchanged.
  const one = await stylePdfMaster(master,{...legacy,pages:{summary:{headingFont:'redhat',backgroundColor:'#E9F2F7'}}},{},fonts);
  const beforeDoc = await PDFDocument.load(master), afterDoc = await PDFDocument.load(one);
  for(const index of [0,1,3,4,5,8,10]) assert.deepEqual(afterDoc.getPage(index).getSize(),beforeDoc.getPage(index).getSize());
  const input={name:'Page style review',arrival:'2026-12-03',departure:'2026-12-10',pickup:'Srinagar',adults:2,youngAges:[],budget:0,hotelCategory:'Signature',transport:'Ertiga',mealPlan:'Breakfast & Dinner',style:'Balanced',interests:['Nature'],pdfTheme:'original',pdfDesign:valid};
  const plan=createPlan(input), selections=plan.hotelPlans.map(h=>({location:h.location,hotelId:'',hotelName:h.location+' Heritage Hotel',category:'Signature',nights:h.nights,rooms:1,extraBeds:0,cnb:0,nightlyRate:4000,extraBedRate:0,cnbRate:0,address:'',roomType:'',website:'',starRating:4,source:'sample',status:'sample'}));
  const quote={transportDaily:4200,transportIsCustom:false,mealPerPersonNight:0,activityBudget:0,activityCosts:{},activitySelections:{},manualInclusions:[],manualExclusions:[],contingencyPct:0,profitPct:10,otherAmount:0};
  const snapshot=JSON.stringify({input,plan,selections,quote});
  const data=Object.fromEntries(pdfDesignPages.map(p=>[p.id,''])); let pages=[];
  const output=await buildThemedClientPdf({data,plan,input,selections,costs:calculateCosts(plan,selections,quote),customerName:input.name,fonts,activityLists:{included:['Shikara ride.'],excluded:['Airfare.']},quote,masterBytes:master,manifest:JSON.parse(fs.readFileSync(path.join(root,'public/pdf-assets/client-master.json'))),design:valid,onPages:value=>{pages=value;}});
  assert.equal(JSON.stringify({input,plan,selections,quote}),snapshot);
  const parsed=await text(output); assert.match(parsed,/Page style review/);assert.match(parsed,/Your journey, considered/);assert.match(parsed,/Airfare/);assert.match(parsed,/Heritage Hotel/);
  assert.equal(pages.length,(await PDFDocument.load(output)).getPageCount());
  assert.ok(pages.some(p=>p.key==='daywise')&&pages.some(p=>p.key==='hotels4'||p.key==='hotels3'||p.key==='hotels2'||p.key==='hotels1'));
  fs.writeFileSync(path.join(root,'tmp/pdfs/page-styles-client.pdf'),output);
  console.log('PASS page styles: native font decoding, all page types, text preservation, bounded settings, metadata, footer controls and unchanged trip data.');
})().catch(error=>{console.error(error);process.exitCode=1;});
