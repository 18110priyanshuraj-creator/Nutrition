# Self-healing and autonomous repository agent

This is a guarded maintenance CLI added to the existing MyNutri app. It uses the project's existing Node/TypeScript setup, Vitest and Google Gemini SDK. It does not replace the nutrition calculation engine.

## Run it

- `npm run agent -- --help` — list commands.
- `npm run agent -- doctor` — run lint, typecheck, tests and production build; it does not edit source.
- `npm run agent -- scan` — run checks, then attempt a bounded safe repair if checks fail.
- `npm run agent -- fix` — same as scan, but intended to focus on current check failures.
- `npm run agent -- "task description"` — ask Gemini to make a scoped change, then verify it.
- `npm run agent:watch` — keep the background monitor running in this Codespace terminal.
- Run `npm run agent:upgrade` — start the bounded multi-round self-upgrade runner. An optional task can follow `--`, for example `npm run agent:upgrade -- "Improve memory and repair recovery"`.
- `npm run agent -- status` — view sanitized Gemini provider/key-slot status.
- `npm run agent -- memory` — view local run summaries and verified lessons.
- `npm run agent -- memory clear` — clear only the local agent memory.

The background watcher runs only while its process/Codespace remains alive. It skips expensive checks/audits when the repository fingerprint has not changed. On each source change, it runs checks and, when Gemini is configured, a cautious AI bug audit. A scheduled GitHub Actions workflow is separate from this local monitor.


## Seven-slot Gemini failover

For local configuration, use `npm run configure:local` in an interactive terminal. `npm run configure:local -- --status` prints only masked configured/empty status. The editor confirms before changing an existing `.env.local`, preserves unrelated settings, and refuses to write unless that file is Git-ignored. Secret input is masked as typed. Enter keeps a value; `-` removes only that key's local-file override. Process/Codespaces environment variables take precedence, so edit those private Secrets directly when they are the active source. No Gemini request is made by this setup command.

Configure private server-side environment variables:

- `GEMINI_API_KEY_1`
- `GEMINI_API_KEY_2`
- `GEMINI_API_KEY_3`
- `GEMINI_API_KEY_4`
- `GEMINI_API_KEY_5`
- `GEMINI_API_KEY_6`
- `GEMINI_API_KEY_7`
- `GEMINI_MODEL`

The previous `GEMINI_API_KEY` variable remains a fallback when no numbered slot is set. Numbered slots are discovered from 1 through 7; the last healthy slot is preferred on later requests, and other available slots are tried only after bounded failures with exponential backoff for transient errors. Never commit secret values or expose them in logs. Slot status reports only configured/empty state and sanitized runtime counters, never key values. `GEMINI_MODEL` must be the API model ID (not a display name); omit the `models/` prefix when copying a name from the model list. Format validation does not prove that the model is accessible. The optional preflight performs one minimal real provider request and must only be run when you choose to spend API quota.

Timeouts, network errors and key-specific credential errors rotate to another available slot. Generic rate-limit responses try a bounded number of slots; when upstream error details explicitly identify a project-wide quota or billing limit, retries stop because other keys for that project cannot fix it. Error details do not always identify quota scope, so an ambiguous 429 is treated as a key-slot rate limit and may try another slot. Invalid models and invalid requests stop early. Cooldowns and the last successful slot are held in server-process memory and reset when the process restarts.

## Safety model

The CLI, upgrade runner, and in-app N widget operate on the current checked-out branch. The in-app task service invokes `scripts/agent.ts`; it is a Gemini-backed guarded Codespace service, not a connection to the VS Code Copilot chat/session.

- The main/in-app agent accepts up to eight related file changes in one patch, with a 100,000-character per-file limit and a 500,000-character aggregate limit. The upgrade runner accepts up to eight files per proposal and runs at most eight plan/edit/verify rounds by default; individual files and aggregate patches are bounded there as well.
- Supported project files include TypeScript/JavaScript, CSS, SQL migrations, JSON, YAML, and Markdown. This includes application/authentication/database source when needed, tests, docs, CI, scripts, and the agent's own implementation/policies. New safe project files may be created; dependency lockfiles, generated output, and private/user data are excluded. Package-manifest changes do not authorize an automatic install or lockfile rewrite.
- Existing tracked edits are part of the baseline. Before changing one, the agent compares the proposal with the original Git diff and requires the user's additions and removals to remain present; it refuses conflicting proposals without overwriting them. Existing untracked files are protected. New paths must remain inside the repository, use an allowed extension, avoid protected locations, and have no symlink ancestor.
- Task completion compares bounded file fingerprints against the submission snapshot, so edits to files that were already dirty are included in the final changed-file list without storing their contents in task history. Changed paths preserve the complete filename from Git porcelain while dirty-file fingerprints are compared with the submission baseline.
- Proposed content is schema/path/size/secret checked before writes. A multi-file batch is applied with snapshots and guarded rollback; the fixed lint, typecheck, test, and production-build checks run after a patch. The upgrade runner keeps the best verified checkpoint and refuses to claim success when required checks fail.
- Commands are executed with `shell: false` from a fixed registry: bounded read-only Git inspection, restricted `rg` searches under project roots, and fixed project test/lint/typecheck/build plus agent doctor/help/status/memory diagnostics. Arbitrary shell, network access, installs, production operations, and migration commands are not allowed. Database migration and persistence tests run through the test suite against disposable test paths.
- Secret values, environment files, private databases, logs, photos, exports, uploads, installed dependencies, Git internals, generated output, and caches remain protected. Owner authorization, same-origin checks, request validation, rate limits, concurrency limits, timeouts, cancellation, bounded logs, and secret redaction remain in place. Tasks never commit, push, deploy, or merge.
- Provider configuration is not provider health: status remains untested until a real bounded generation request succeeds. Task status is shown as verified only after the task process exits successfully and its required checks actually pass.
- The local `.agent/memory.json` stores bounded summaries and lessons from passing repairs, not API keys, meal records, photos, database contents, or full diagnostics. Failed or cancelled tasks remain reviewable and may only be explicitly resumed within the retry limit.

This is guarded automation, not a promise that every issue can be repaired automatically. Review generated diffs before committing.
- This is guarded automation, not a promise that every issue can be repaired automatically. Review generated diffs before committing.

## Environment controls

- `GEMINI_MODEL`: required API model ID; no specific model name is hard-coded.
- `GEMINI_API_KEY_1` … `GEMINI_API_KEY_7`: private key slots.
- `GEMINI_API_KEY`: legacy fallback.
- `GEMINI_MAX_RETRIES=3`: extra key attempts, capped at six and limited to configured slots; set 6 to allow all seven slots.
- `GEMINI_REQUEST_TIMEOUT_MS=60000`: model request timeout.
- `GEMINI_KEY_COOLDOWN_MS=60000`: cooldown for a failing key slot.
- `AGENT_AUTO_SCAN=true`: enable scans in watch mode.
- `AGENT_SCAN_INTERVAL_MINUTES=30`: monitor interval (minimum five minutes).
- `AGENT_AUTO_FIX_SAFE_BUGS=true`: allow repairs following failed checks.
- `AGENT_MAX_REPAIR_ATTEMPTS=3`: repair attempts, bounded to 1–3.
- `AGENT_CHECK_TIMEOUT_MS=900000`: per-check timeout, bounded by the program.

Only the fixed project check scripts are executed. Gemini cannot ask the host to execute arbitrary shell commands.

### Upgrade-runner controls

- `AGENT_UPGRADE_MAX_ROUNDS=8`: plan/edit/verify rounds, bounded to 1–8.
- `AGENT_UPGRADE_CHECK_TIMEOUT_MS=900000`: per-check timeout, bounded by the runner.
- `AGENT_UPGRADE_MAX_OUTPUT_TOKENS=24576`: maximum Gemini response budget, bounded by the runner.

Use `npm run agent:upgrade -- --preflight` to make one small live Gemini request and verify that `GEMINI_MODEL`, credentials, network access, and model permissions work before starting a multi-round edit. This preflight does not edit repository files. The upgrade runner writes a redacted progress report to the ignored local `.agent/upgrade-report.json` and verified lessons to `.agent/memory.json`. Its Gemini planner can use structured terminal tools: read-only Git status/inventory/log checks, `rg` searches limited to `app`, `src`, `tests`, `scripts`, and `docs`, plus fixed npm test/lint/typecheck/build and agent doctor/memory/help/status commands. Recursive repair scans and watch mode are deliberately not exposed as nested terminal tools. Every proposed command is checked against an exact allowlist and executed without a shell. Installs, database migrations, arbitrary scripts, network commands, destructive Git commands, and deployment remain blocked. Tool output is redacted and returned to the next planning call. Inspect `git diff` before accepting changes; the runner does not commit or push.
