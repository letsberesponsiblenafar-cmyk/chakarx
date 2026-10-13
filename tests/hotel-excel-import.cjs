const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const ExcelJS=require('exceljs');
const root=path.resolve(__dirname,'..');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){return resolve.call(this,request.startsWith('@/')?path.join(root,request.slice(2)):request,parent,isMain,options);};
require.extensions['.ts']=function(module,filename){module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);};
const {parseHotelExcel,validateHotelImportBatch,checkHotelWorkbookArchive}=require('../lib/hotel-excel-import.ts');
const {validateHotel}=require('../lib/hotel-validation.ts');
const {parseHotelPdfText}=require('../lib/hotel-pdf-import.ts');
let checks=0;
async function test(name,run){await run();checks++;process.stdout.write(`PASS ${name}\n`);}
async function workbook(sheets){const book=new ExcelJS.Workbook();for(const [name,rows] of sheets){const sheet=book.addWorksheet(name);for(const row of rows)sheet.addRow(row);}return new Uint8Array(await book.xlsx.writeBuffer());}
async function flat(rows,name='Hotels',filename='hotel-rates.xlsx',existing=[]){return parseHotelExcel(await workbook([[name,rows]]),existing,filename);}
const master=validateHotel({id:'saved-hotel',destination:'Sonamarg',name:'Grand Valley',normalizedCategory:'Elite',sourceCategory:'3 Star Deluxe',mapB2B:2500,extraBedB2B:700,cnbB2B:400,address:'Existing address',roomType:'Deluxe',website:'',notes:'Operator notes'});

(async()=>{
await test('template headers import typed rates, zero charges and supplier category',async()=>{
  const [record]=await flat([['Destination','Hotel','Category','MAP B2B','Extra Bed B2B','CNB B2B','Stars','Room Type','Website'],['Srinagar','Hotel One','3 Star Deluxe',2500,0,0,3,'Deluxe','https://example.com']]);
  assert.equal(record.action,'create');assert.equal(record.hotel.mapB2B,2500);assert.equal(record.hotel.extraBedB2B,0);assert.equal(record.hotel.cnbB2B,0);assert.equal(record.hotel.starRating,3);assert.equal(record.hotel.sourceType,'Excel import');assert.equal(record.hotel.normalizedCategory,'3 Star Deluxe');assert.equal(record.hotel.sourceCategory,'3 Star Deluxe');
});
await test('shipped Excel template round-trips both example hotels',async()=>{
  const records=await parseHotelExcel(fs.readFileSync(path.join(root,'public/templates/Chakar-Hotel-Master-Template.xlsx')),[],'Chakar-Hotel-Master-Template.xlsx');
  assert.equal(records.length,2);
  assert.deepEqual(records.map(({hotel})=>[hotel.destination,hotel.name,hotel.normalizedCategory,hotel.starRating,hotel.mapB2B,hotel.extraBedB2B,hotel.cnbB2B]),[
    ['Srinagar','Example Srinagar Hotel','3 Star',3,2500,800,600],
    ['Gulmarg','Example Gulmarg Hotel','4 Star',4,4000,1200,800],
  ]);
});
await test('filename destination fallback accepts alternate name and rate headers',async()=>{
  const [record]=await flat([['Hotel Name','MAP rate','Extra Bed','CNB'],['New Hotel','₹ 2,500','Rs. 1,000/-','INR 0']],'Sheet1','Pahalgam hotels.xlsx');
  assert.equal(record.hotel.destination,'Pahalgam');assert.equal(record.hotel.mapB2B,2500);assert.equal(record.hotel.extraBedB2B,1000);assert.equal(record.hotel.cnbB2B,0);
});
await test('hotels named Hotel or Name are data rows when rates are present',async()=>{
  const records=await flat([['Destination','Hotel','MAP'],['Srinagar','Hotel',2500],['Srinagar','Name',2700]]);
  assert.deepEqual(records.map(({hotel})=>hotel.name),['Hotel','Name']);
});
await test('multi-sheet destinations override destination in filename',async()=>{
  const records=await parseHotelExcel(await workbook([['Gulmarg',[['Hotel','MAP'],['Valley Hotel',3500]]],['Pahalgam',[['Hotel','MAP'],['River Hotel',4200]]]]),[],'Srinagar hotels.xlsx');
  assert.deepEqual(records.map((record)=>record.hotel.destination),['Gulmarg','Pahalgam']);
});
await test('original supplier layout reads side-by-side category groups and blank rates',async()=>{
  const records=await flat([['Srinagar Hotels Budget','MAP','Extra Bed','CNB','3 Star Deluxe','MAP','Extra Bed','CNB','5 Star Premium'],[],['City Grace',2500,800,600,'Shaf Excellency',3000,1000,800,'Taj Dal View']],'Sheet1','Doodpathri hotels.xlsx');
  assert.equal(records.length,3);assert(records.every((record)=>record.hotel.destination==='Srinagar'));
  assert.equal(records[0].hotel.normalizedCategory,'Budget');assert.equal(records[1].hotel.normalizedCategory,'3 Star Deluxe');assert.equal(records[1].hotel.starRating,3);assert.equal(records[2].hotel.mapB2B,null);assert.equal(records[2].hotel.starRating,5);
});
await test('original name-only destination sheets import without invented rates',async()=>{
  const records=await flat([['Doodhpathri'],[],['High Speed Resort'],[],['Hill Mount']],'Sheet5','Srinagar hotels.xlsx');
  assert.equal(records.length,2);assert(records.every((record)=>record.hotel.destination==='Doodhpathri'&&record.hotel.mapB2B===null));
});
await test('name-only supplier updates preserve existing rates and category',async()=>{
  const prior={...master,destination:'Gurez',name:'Cocoon'};
  const [record]=await flat([['Gurez'],[],['Cocoon']],'Sheet6','Srinagar hotels.xlsx',[prior]);
  assert.equal(record.action,'update');assert.equal(record.hotel.mapB2B,prior.mapB2B);assert.equal(record.hotel.normalizedCategory,'Elite');assert.equal(record.hotel.sourceCategory,prior.sourceCategory);
});
await test('cached formula results are used without evaluating formulas',async()=>{
  const [record]=await flat([['Destination','Hotel','MAP B2B'],['Srinagar','Formula Hotel',{formula:'2000+500',result:2500}]]);
  assert.equal(record.hotel.mapB2B,2500);
});
await test('formulas without cached results require recalculation',async()=>{
  await assert.rejects(()=>flat([['Destination','Hotel','MAP'],['Srinagar','Formula Hotel',{formula:'2000+500'}]]),/no saved result/i);
});
await test('Excel error values are rejected rather than treated as free rates',async()=>{
  await assert.rejects(()=>flat([['Destination','Hotel','MAP'],['Srinagar','Formula Hotel',{error:'#DIV/0!'}]]),/formula error/i);
});
await test('rich text hotel names retain their readable text',async()=>{
  const [record]=await flat([['Destination','Hotel','MAP'],['Srinagar',{richText:[{text:'Grand '},{font:{bold:true},text:'Palace'}]},3000]]);
  assert.equal(record.hotel.name,'Grand Palace');
});
await test('blank and on-request rates remain null while explicit zero stays zero',async()=>{
  const records=await flat([['Destination','Hotel','MAP','Extra Bed','CNB'],['Srinagar','Blank',null,'On request',0]]);
  assert.equal(records[0].hotel.mapB2B,null);assert.equal(records[0].hotel.extraBedB2B,null);assert.equal(records[0].hotel.cnbB2B,0);
});
await test('invalid negative rates fail hotel validation',async()=>{
  await assert.rejects(()=>flat([['Destination','Hotel','MAP'],['Srinagar','Bad Rate',-100]]),/invalid B2B rate/i);
});
await test('rate ranges and arbitrary currency text are rejected',async()=>{
  await assert.rejects(()=>flat([['Destination','Hotel','MAP'],['Srinagar','Bad Rate','2500-3500']]),/one numeric rate/i);
});
await test('ID matching updates the existing hotel and retains manual band',async()=>{
  const [record]=await flat([['ID','Destination','Hotel','Category','MAP'],['saved-hotel','Sonamarg','Grand Valley','4 Star Premium',4000]],'Hotels','rates.xlsx',[master]);
  assert.equal(record.action,'update');assert.equal(record.hotel.id,'saved-hotel');assert.equal(record.hotel.normalizedCategory,'Elite');assert.equal(record.hotel.sourceCategory,'4 Star Premium');assert.equal(record.hotel.mapB2B,4000);assert.equal(record.hotel.address,'Existing address');
});
await test('normalized destination and hotel name matching retains ID and manual band',async()=>{
  const [record]=await flat([['Destination','Hotel','Category','MAP'],['Sonmarg','  GRAND   Valley  ','Budget',3300]],'Hotels','rates.xlsx',[master]);
  assert.equal(record.action,'update');assert.equal(record.hotel.id,'saved-hotel');assert.equal(record.hotel.normalizedCategory,'Elite');
});
await test('supplier IDs cannot duplicate a property matched by destination and name',async()=>{
  const [record]=await flat([['ID','Destination','Hotel','Category','MAP'],['supplier-100','Sonmarg','Grand Valley','Budget',3300]],'Hotels','rates.xlsx',[master]);
  assert.equal(record.hotel.id,'saved-hotel');
});
await test('duplicate hotels across worksheets fail instead of creating two records',async()=>{
  const bytes=await workbook([['Sonamarg',[['Hotel','MAP'],['Grand Valley',3000]]],['Sonmarg',[['Hotel','MAP'],[' GRAND   VALLEY ',3000]]]]);
  await assert.rejects(()=>parseHotelExcel(bytes,[],'rates.xlsx'),/Duplicate hotel/i);
});
await test('manual package band is rechecked at apply after a stale preview',()=>{
  const stale={...master,normalizedCategory:'Signature',sourceCategory:'Budget',mapB2B:3600,sourceType:'Excel import',sourceFiles:['rates.xlsx']};
  const [record]=validateHotelImportBatch([{hotel:stale}],[master]);
  assert.equal(record.normalizedCategory,'Elite');assert.equal(record.mapB2B,3600);assert.equal(record.sourceCategory,'Budget');
});
await test('apply protects manual category on normalized name-only matches too',()=>{
  const [record]=validateHotelImportBatch([{...master,id:'supplier-999',destination:'Sonmarg',name:' GRAND   VALLEY ',normalizedCategory:'3 Star',sourceFiles:['rates.xlsx']}],[master]);
  assert.equal(record.id,'saved-hotel');assert.equal(record.normalizedCategory,'Elite');
});
await test('apply rejects duplicate names even when proposal IDs differ',()=>{
  assert.throws(()=>validateHotelImportBatch([{...master,id:'new-1'}, {...master,id:'new-2',name:' GRAND   VALLEY '}],[]),/Duplicate hotel/i);
});
await test('PDF import still supports the existing record format and manual category protection',()=>{
  const [record]=parseHotelPdfText('CHAKAR HOTEL RECORD\nDestination: Sonmarg\nHotel: Grand Valley\nCategory: Budget\nMAP B2B: 3400\nEND HOTEL',[master],'master.pdf');
  assert.equal(record.hotel.id,'saved-hotel');assert.equal(record.hotel.normalizedCategory,'Elite');assert.equal(record.hotel.mapB2B,3400);
});
await test('unknown tables show an actionable error',async()=>{
  await assert.rejects(()=>flat([['Something','Other'],['None','Nope']]),/no hotel table was recognised/i);
});
await test('missing destination is not silently assigned',async()=>{
  await assert.rejects(()=>flat([['Hotel','MAP'],['New Hotel',2500]]),/destination is missing/i);
});
await test('older .xls and files renamed to .xlsx are rejected',async()=>{
  await assert.rejects(()=>parseHotelExcel(Buffer.from('not an Excel workbook'),[],'rates.xls'),/Older .xls/i);
  await assert.rejects(()=>parseHotelExcel(Buffer.from('%PDF-this-is-not-Excel'),[],'rates.xlsx'),/valid Excel/i);
});
await test('sparse out-of-bounds rows are rejected before workbook loading',async()=>{
  const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Srinagar');sheet.getCell('A5001').value='Hotel';
  const bytes=new Uint8Array(await book.xlsx.writeBuffer());
  assert.throws(()=>checkHotelWorkbookArchive(bytes),/5,000 rows/i);
});
await test('more than 20 sheets are rejected before workbook loading',async()=>{
  const bytes=await workbook(Array.from({length:21},(_,index)=>[`Sheet${index}`,[['Destination','Hotel'],['Srinagar','Hotel']]]));
  assert.throws(()=>checkHotelWorkbookArchive(bytes),/20 worksheets/i);
});
await test('declared decompression bombs are rejected before inflation',async()=>{
  const bytes=Buffer.from(await workbook([['Hotels',[['Destination','Hotel'],['Srinagar','Hotel']]]]));
  const offset=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bytes.writeUInt32LE(50*1024*1024,offset+24);
  assert.throws(()=>checkHotelWorkbookArchive(bytes),/too large/i);
});
await test('invalid ZIP metadata fails safely',async()=>{
  const bytes=Buffer.from(await workbook([['Hotels',[['Destination','Hotel'],['Srinagar','Hotel']]]]));
  const offset=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bytes.writeUInt32LE(bytes.length+100,offset+42);
  assert.throws(()=>checkHotelWorkbookArchive(bytes),/unsupported Excel/i);
});
const fixtureDirectory=process.env.CHAKAR_HOTEL_FIXTURE_DIR;
if(fixtureDirectory){
  for(const filename of ['Srinagar','Gulmarg','Sonmarg','Pahalgam','Gurez','Doodpathri'].map((name)=>`${name} hotels sheet oct.xlsx`)){
    await test(`original workbook: ${filename}`,async()=>{
      const records=await parseHotelExcel(fs.readFileSync(path.join(fixtureDirectory,filename)),[],filename);
      assert.equal(records.length,166);assert.deepEqual([...new Set(records.map((record)=>record.hotel.destination))].sort(),['Doodhpathri','Gulmarg','Gurez','Pahalgam','Sonamarg','Srinagar']);
      assert.equal(records.find((record)=>record.hotel.name==='City Grace').hotel.mapB2B,2500);
      assert.equal(records.find((record)=>record.hotel.name==='Barzman').hotel.mapB2B,null);
    });
  }
}
process.stdout.write(`\n${checks} hotel Excel import checks passed.\n`);
})().catch((error)=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
