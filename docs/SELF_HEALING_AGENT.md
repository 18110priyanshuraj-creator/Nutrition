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

Configure private server-side environment variables:

- `GEMINI_API_KEY_1`
- `GEMINI_API_KEY_2`
- `GEMINI_API_KEY_3`
- `GEMINI_API_KEY_4`
- `GEMINI_API_KEY_5`
- `GEMINI_API_KEY_6`
- `GEMINI_API_KEY_7`
- `GEMINI_MODEL`

The previous `GEMINI_API_KEY` variable remains a fallback when no numbered slot is set. Never commit secret values or expose them in logs.

Timeouts, network errors and key-specific credential errors rotate to another available slot. Rate-limit responses also try a bounded number of slots, but Gemini rate limits are project-scoped: keys from the same Google AI project share quotas, so rotation only helps when another slot has a usable independent project/quota. Explicit project-wide quota or billing errors, invalid models and invalid requests stop early. Cooldowns and the last successful slot are held in server-process memory and reset when the process restarts.

## Safety model

The original `agent` command remains a deliberately narrow repair mode. `agent:upgrade` is a separate, broader self-improvement mode with a default maximum of eight rounds (`AGENT_UPGRADE_MAX_ROUNDS`, bounded to 1–8). It may edit its own main agent, the running upgrade runner, and `src/lib/agent/` implementation, and can create source/test files. It does not execute model-provided arbitrary shell commands, change authentication/session or database/schema/migration code, edit secrets/lockfiles/workflows/package configuration, deploy, commit, push, or merge. It runs only the repository's fixed `lint`, `typecheck`, `test`, and `build` scripts, and preserves a best-scoring checkpoint.

- The agent operates on the current checked-out branch only. It never creates branches, commits, pushes, or merges.
- Existing uncommitted and untracked work is preserved. A tracked file already modified by a person is ineligible for an automatic patch.
- The original repair mode edits only clean existing TypeScript/TSX app/test files and protects agent core. The upgrade mode can edit eligible clean source files including `scripts/agent.ts` and `src/lib/agent/`, plus create new source/test files. Auth/session, database/schema/migrations, restore endpoints, environment files, package/lock configuration, and workflows remain protected. The running upgrade runner itself is editable, but changes must pass the same diff, lint, typecheck, test, and build checks.
- The original repair mode verifies a proposed patch with `git diff --check`, lint, typecheck, tests and production build, and reverts failed patches when the files still match its proposal. The upgrade mode runs these checks after each round, sends failure diagnostics into subsequent rounds, and restores its best-scoring checkpoint if a later round regresses.
- The original repair mode makes at most three repair attempts by default. The upgrade mode runs up to eight plan/edit/verify rounds by default and may be configured between one and eight rounds. A passing repair remains uncommitted on the current branch so the diff can be reviewed first.
- The local `.agent/memory.json` stores bounded run summaries and lessons from verified, passing repairs. It does not store API keys, meal records, photos, database contents or full diagnostic output. The original maintenance mode cannot edit the agent core; the upgrade mode can improve the main agent and the running upgrade runner, subject to bounded verification. Verified successful lessons are read into future upgrade prompts and written to local `.agent/memory.json`.
- This is guarded automation, not a promise that every issue can be repaired automatically. Review generated diffs before committing.

## Environment controls

- `GEMINI_MODEL`: required model name; model is not hard-coded.
- `GEMINI_API_KEY_1` … `GEMINI_API_KEY_7`: private key slots.
- `GEMINI_API_KEY`: legacy fallback.
- `GEMINI_MAX_RETRIES=3`: extra key attempts, capped at four total.
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

The upgrade runner writes a redacted progress report to the ignored local `.agent/upgrade-report.json` and verified lessons to `.agent/memory.json`. Its Gemini planner can use structured terminal tools: read-only Git status/inventory/log checks, `rg` searches limited to `app`, `src`, `tests`, `scripts`, and `docs`, plus fixed npm test/lint/typecheck/build and agent help/status commands. Every proposed command is checked against an exact allowlist and executed without a shell. Installs, database migrations, arbitrary scripts, network commands, destructive Git commands, and deployment remain blocked. Tool output is redacted and returned to the next planning call. Inspect `git diff` before accepting changes; the runner does not commit or push.
