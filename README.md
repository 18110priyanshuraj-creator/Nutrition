# MyNutri AI

Personal nutrition tracker with SQLite persistence, server-side Gemini food proposals, editable food logging, a daily dashboard, history, measurements, recommendations, and data export.

## Data quality limitation

The starter catalog intentionally contains a small set of provisional generic estimates, not verified ICMR-NIN/IFCT rows. Missing nutrients remain unknown, not zero. Before relying on comprehensive micronutrient totals, import or verify records against a suitable licensed, traceable composition source. The application stores source labels and confidence so values can be audited. Do not present the seed catalog as complete.

## Requirements and setup

- Node.js 22 or newer and npm
- A unique APP_PASSWORD with at least 12 characters
- A random SESSION_SECRET with at least 32 characters
- GEMINI_API_KEY and GEMINI_MODEL only for live text/photo analysis

1. Copy .env.example to .env and replace the security placeholders.
2. Run npm install.
3. Run npm run db:migrate.
4. Run npm run dev and open port 3000.
5. Sign in with APP_PASSWORD.
6. Pick a food, edit the gram portion, and save. SQLite writes to data/mynutri.sqlite by default.

Set GEMINI_API_KEY and GEMINI_MODEL on the server to enable live AI proposals. The model is intentionally not hard-coded. If Gemini is unavailable, manual food selection and deterministic calculations still work.

## Persistence and deployment

SQLite suits one personal instance. In production, mount a persistent disk and set DATABASE_PATH to a path on it; ephemeral container filesystems are not durable. Back up using a SQLite-consistent backup method. Do not scale this SQLite deployment horizontally. Before multi-instance hosting, migrate to a managed database and private object storage. The Docker Compose volume persists the database between container restarts. This commit does not deploy a live service.

## Self-healing repository agent

A guarded local maintenance CLI can run the project's lint, typecheck, test and production-build checks, attempt bounded Gemini-generated fixes on the **current branch**, verify every change, and save lessons only from passing repairs.

- Run `npm run agent -- doctor` for checks only.
- Run `npm run agent -- scan` to check, repair failures, and audit changed code for concrete bugs when Gemini is configured.
- Run `npm run agent -- "describe a focused task"` to request a code change.
- Run `npm run agent:watch` to monitor changes while the Codespace process remains alive.
- Run `npm run agent:upgrade` for a multi-round Gemini coding-agent upgrade. It can use validated Git/search/test terminal tools, edit multiple eligible files including its own agent core, run checks after each patch, repair failures, retain the best-scoring checkpoint, and reuse verified project memory (up to eight rounds by default).
- Run `npm run agent -- status` to inspect redacted seven-slot Gemini failover status.

Set `GEMINI_MODEL` and `GEMINI_API_KEY_1` through `GEMINI_API_KEY_7` in the private server environment. The legacy `GEMINI_API_KEY` remains supported when numbered slots are absent. The maintenance command does not create branches, commit, push or merge. The upgrade command can use allowlisted terminal tools and modify its main agent core plus the upgrade runner through a bounded test-and-repair loop, but still preserves pre-existing dirty files, protects auth/database/secrets, and never runs arbitrary model-provided shell commands or pushes/merges. See [the agent guide](docs/SELF_HEALING_AGENT.md) for limits and safety details.

## Checks

Run npm test, npm run lint, npm run typecheck, and npm run build. Automated tests do not require Gemini credentials. A passing build does not verify the live API or a production deployment.

## Health note

This is a food-intake tracker, not a diagnostic device. Targets are user-configured rather than automatically validated prescriptions. At age 17, growth and body-size interpretation must be age-appropriate. The app must not promise height gain, diagnose deficiencies from food logs, or recommend growth-hormone products or megadose supplements.