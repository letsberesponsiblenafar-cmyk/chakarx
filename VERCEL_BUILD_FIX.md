# Vercel build fix

Fixed the TypeScript errors reported by Vercel on commit 2ffdd4d:

- `app/planner/hotels/page.tsx`: restored the typed `usePlanner` import. Without it, TypeScript loses the inferred hotel database type and reports callback parameters such as `h` as implicit `any`.
- `components/ClientPdf.tsx`: captured the already-validated `plan` and `costs` values in `currentPlan` and `currentCosts` before the async download closure. This prevents TypeScript's closure narrowing issue (`TS18047: possibly null`).

No `ignoreBuildErrors` or TypeScript bypass was added.

Recommended Vercel settings:
- Framework: Next.js
- Build command: `npm run build`
- Node.js: 22.x
