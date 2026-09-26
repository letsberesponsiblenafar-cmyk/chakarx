import fs from 'node:fs';
const file = 'components/ClientPdf.tsx';
const src = fs.readFileSync(file, 'utf8');
const checks = {
  fetchesCover: src.includes("publicImageDataUrl(COVER_MASTER)"),
  fetchesRules: src.includes("publicImageDataUrl(RULES_MASTER)"),
  noDirectImageUrlAddImage: !src.includes("addImage(COVER_MASTER") && !src.includes("addImage(RULES_MASTER"),
  doesNotBlockOnHotelRates: src.includes("const pdfReady = currentPlan.dayPlans.length > 0"),
  hasBlobGuard: src.includes("blob.size < 1024"),
  hasDownload: src.includes("anchor.download"),
};
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (Object.values(checks).some(v => !v)) process.exit(1);
