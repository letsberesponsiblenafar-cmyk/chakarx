# Delivery workflow

For requested product or code changes, complete the relevant checks, commit the changes, push them to GitHub, and verify the production Vercel deployment at https://chakarx.vercel.app. The user has explicitly requested this workflow for future change requests.

Read-only reviews remain read-only. Preserve unrelated work and never force-push to publish changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
