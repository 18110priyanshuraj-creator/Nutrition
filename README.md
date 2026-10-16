# MyNutri AI

Personal nutrition tracker with SQLite persistence, server-side Gemini food recognition, one-action text meal logging, a daily dashboard, history, measurements, recommendations, and data export.

## Data quality limitation

The starter catalog intentionally contains a small set of provisional generic estimates, not verified ICMR-NIN/IFCT rows. Missing nutrients remain unknown, not zero. Before relying on comprehensive micronutrient totals, import or verify records against a suitable licensed, traceable composition source. The application stores source labels and confidence so values can be audited. Do not present the seed catalog as complete.

## Food logging and portion estimates

In **Log Food**, enter a meal in English, Hindi, or Hinglish and choose **Analyze & log meal**. Safely matched catalog foods with usable portions are saved automatically. Unrecognized foods are omitted, and the save message explains when totals may be incomplete. The manual-entry fallback is available when AI is unavailable or to add a catalog food the model could not match. The saved card shows the original description, date/category, portion provenance, available nutrient totals, and diary/edit/undo actions.

Each submission uses a unique idempotency key: retries return the canonical saved meal instead of adding duplicate records, while logging the same meal intentionally later uses a new key.

Explicit gram quantities are retained as entered. Supported household portions use food-specific estimates rather than a universal piece weight: for example, the almond and edible walnut-kernel estimates cite USDA FoodData Central SR Legacy records 170567 and 170187, respectively. Other household measures (including amla, roti, cooked rice, dal, and milk) are provisional editable estimates; they are not official composition data. Foods or portions the catalog cannot safely resolve are omitted from that meal's totals; use manual entry to add a catalog food and gram amount. AI-proposed nutrients are never used to calculate totals.

## Requirements and setup

- Node.js 22 or newer and npm
- A unique APP_PASSWORD with at least 12 characters
- A random SESSION_SECRET with at least 32 characters
- Gemini keys and GEMINI_MODEL only for live text/photo analysis

1. Run `npm run configure:local` in an interactive terminal. It shows masked configuration status, asks before modifying an existing `.env.local`, updates selected values only, and preserves unrelated settings. It refuses to write unless Git confirms `.env.local` is ignored. Use Enter to keep a value and `-` to clear a local Gemini key/model override.
2. Enter a private APP_PASSWORD of at least 12 characters when prompted. The tool creates a cryptographically random SESSION_SECRET if one is not already configured; its value is never displayed.
3. Run `npm run db:migrate`.
4. Run `npm run dev` and open `http://localhost:3000/login`.
5. Sign in with the APP_PASSWORD configured in the effective server environment. There is no demo account or built-in default password.
6. Pick a food, edit the gram portion, and save. SQLite writes to `data/mynutri.sqlite` by default.

Use `npm run configure:local -- --status` to see which local settings are configured without revealing their values. In Codespaces, configure or replace production/development `APP_PASSWORD`, `SESSION_SECRET`, and Gemini keys through the repository or Codespace's private Secrets settings; injected process environment values take precedence over `.env.local`. Restart the server after changing local settings. To reset the owner password, replace APP_PASSWORD through the applicable private settings, then restart; existing session cookies remain protected by SESSION_SECRET.

If you no longer know the configured password, it cannot be recovered from this app. Replace APP_PASSWORD with a new private value (at least 12 characters) in the environment source shown by the masked status tool, restart the server, then sign in at `http://localhost:3000/login` or use the browser URL shown for forwarded port 3000 in Codespaces. There is no demo account or built-in password reset endpoint.

Set one or more of `GEMINI_API_KEY_1` through `GEMINI_API_KEY_7` and `GEMINI_MODEL` to enable live AI proposals. Numbered keys have priority in slot order; the last healthy slot stays preferred across requests, with bounded failover, exponential backoff and cooldown on failures. The legacy `GEMINI_API_KEY` is used only when no numbered slot is set. `GEMINI_MODEL` must be the API model ID, not the model's human-readable display name. When copying a name from the Gemini model list, omit its `models/` prefix. The provider checks the ID's basic format; only a live test confirms project access. Use the Gemini SDK model list or Google AI Studio to find an ID your project supports. `GEMINI_MAX_RETRIES` defaults to 3 extra key attempts (up to four total requests, limited to configured slots); set 6 to permit all seven slots. Use `npm run configure:local -- --status` to see masked key/model configuration, then `npm run agent:upgrade -- --preflight` for one small live test. A server restart is required after changing environment values. If Gemini is unavailable, manual food selection and deterministic calculations still work.

## Persistence and deployment

SQLite suits one personal instance. In production, mount a persistent disk and set DATABASE_PATH to a path on it; ephemeral container filesystems are not durable. Back up using a SQLite-consistent backup method. Do not scale this SQLite deployment horizontally. Before multi-instance hosting, migrate to a managed database and private object storage. The Docker Compose volume persists the database between container restarts. This commit does not deploy a live service.

## Self-healing repository agent

A guarded local maintenance CLI can run the project's lint, typecheck, test and production-build checks, attempt bounded Gemini-generated fixes on the **current branch**, verify every change, and save lessons only from passing repairs.

- Run `npm run agent -- doctor` for checks only.
- Run `npm run agent -- scan` to check, repair failures, and audit changed code for concrete bugs when Gemini is configured.
- Run `npm run agent -- "describe a focused task"` to request a code change.
- Run `npm run agent:watch` to monitor changes while the Codespace process remains alive.
- Run `npm run agent:upgrade` for a multi-round Gemini coding-agent upgrade. It can use validated Git/search/test terminal tools, edit multiple eligible files including its own agent core, run checks after each patch, repair failures, retain the best-scoring checkpoint, and reuse verified project memory (up to eight rounds by default).
- Run `npm run agent:upgrade -- --preflight` before an upgrade to verify that the configured Gemini model, key slots, network access, and permissions work; it sends one tiny request and edits no files.
- See [Codespace quick start](docs/CODESPACE_AGENT_QUICKSTART.md) for safe branch sync, private Gemini setup, live preflight, autonomous runs, result review, and stale-branch cleanup.
- Run `npm run agent -- status` to inspect redacted seven-slot Gemini failover status.
- Open the bottom-right **N** button in the authenticated Codespace app to submit a guarded repository task, review its logs/checks, cancel it, or resume an interrupted attempt. It invokes the existing Gemini-backed CLI, not the VS Code Copilot chat session; see the [in-app agent safety and runtime notes](docs/CODESPACE_AGENT_QUICKSTART.md#in-app-n-widget).

Set `GEMINI_MODEL` and `GEMINI_API_KEY_1` through `GEMINI_API_KEY_7` in the private server environment. The legacy `GEMINI_API_KEY` remains supported when numbered slots are absent. The maintenance command does not create branches, commit, push or merge. The upgrade command can use allowlisted terminal tools and modify its main agent core plus the upgrade runner through a bounded test-and-repair loop, but still preserves pre-existing dirty files, protects auth/database/secrets, and never runs arbitrary model-provided shell commands or pushes/merges. See [the agent guide](docs/SELF_HEALING_AGENT.md) for limits and safety details.

## Checks

Run `npm test`, `npm run lint`, `npm run typecheck`, and `NODE_ENV=production npm run build` for production-build verification. Next.js sets `NODE_ENV` for each command; do not set it in `.env`. If an existing local `.env` contains `NODE_ENV=development`, explicitly use the production override for a production build. Automated tests do not require Gemini credentials. Database smoke tests use disposable temporary SQLite databases and do not modify the configured personal database. A passing build does not verify the live API or a production deployment.

## Health note

This is a food-intake tracker, not a diagnostic device. Targets are user-configured rather than automatically validated prescriptions. At age 17, growth and body-size interpretation must be age-appropriate. The app must not promise height gain, diagnose deficiencies from food logs, or recommend growth-hormone products or megadose supplements.
