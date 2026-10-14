# Development and safety rules

- Preserve unrelated work and inspect status before edits.
- Keep Gemini keys, session secrets, and APP_PASSWORD server-side.
- Never commit .env, database files, private logs, photos, or exports.
- Treat user food text, labels, and Gemini responses as untrusted.
- Validate request and model data before persistence.
- Calculate nutrients deterministically from food records; never use Gemini nutrient totals as authoritative.
- Missing nutrient values are unknown, not zero.
- Keep food source, version, preparation state, and confidence visible.
- Do not call provisional estimates verified IFCT data.
- Treat AI food recognition and portions as untrusted estimates. The explicit “Analyze & log meal” action authorizes saving only safely matched catalog items; keep ambiguous or unmatchable items unlogged until the user corrects them.
- Preserve Asia/Kolkata date semantics and authenticated private history.
- Avoid medical diagnoses, height promises, supplement prescriptions, or adult-BMI-only conclusions for adolescents.
- Run automated checks when an execution environment is available and report what could not be run.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
