# Self-healing repository agent

An additive local maintenance CLI for this existing MyNutri Next.js/TypeScript app. It uses the existing Google Gemini SDK and existing lint, typecheck, Vitest and build commands. Gemini does not calculate authoritative nutrient totals.

## Commands

- npm run agent -- --help
- npm run agent -- doctor: lint, typecheck, tests and production build; no source edits.
- npm run agent -- scan: run checks, then try a safe repair for failures.
- npm run agent -- fix: repair failing checks in an isolated Git worktree.
- npm run agent -- "task description": ask Gemini for a scoped change, verify it, and commit only if all checks pass.
- npm run agent -- watch: background polling while this process is alive; unchanged repository state skips full checks.
- npm run agent -- status: show sanitized provider slot status.
- npm run agent -- memory: inspect local run history and verified lessons.
- npm run agent -- memory clear: clear only .agent/memory.json.

Watch mode stops when the Codespace sleeps/stops or the terminal process is closed. An always-on monitor needs a scheduled CI runner or always-on host.

## Gemini key failover

Configure GEMINI_API_KEY_1 through GEMINI_API_KEY_4 and GEMINI_MODEL on the server-side environment. If no numbered keys are configured, legacy GEMINI_API_KEY still works. Raw keys are never returned by status endpoints or saved to memory.

Timeouts, network errors, per-key throttling and key-specific credential failures can rotate to the next available slot. An explicit project-wide quota or billing limit, invalid model, or invalid request stops early because another key usually cannot fix those errors. Cooldowns and active-slot status live in process memory.

## Repair safety

- Each repair uses a fresh agent/repair-* Git branch and isolated temporary worktree. The user's current checkout and uncommitted edits are never overwritten.
- The repair starts from committed HEAD, so uncommitted local changes are intentionally excluded from the repair branch.
- Automatic code patches are limited to existing TypeScript/TSX app and test files. Auth/session, database/schema/migrations, restore endpoints, environment files, package manifests/lockfiles, CI workflow and the agent's own core are protected.
- Every candidate must pass git diff --check, lint, typecheck, tests and production build. Failed patches are reverted inside the temporary worktree. The agent creates a commit only after every check passes.
- AGENT_AUTO_PUSH=false by default. If explicitly enabled, a verified repair branch may be pushed; no branch is automatically merged.
- .agent/memory.json stores recent run metadata and lessons from verified successful repairs. It excludes API keys, meals, photos, database contents, environment values and raw command output. The model cannot modify its agent core.
- This is guarded automation, not a guarantee that every bug can be fixed. Review changes before integrating a branch.

## Environment variables

GEMINI_MODEL: required Google model identifier; no model is hard-coded.
GEMINI_API_KEY_1 through GEMINI_API_KEY_4: private key slots.
GEMINI_API_KEY: legacy fallback when numbered slots are not configured.
GEMINI_MAX_RETRIES=3: retries after the first attempt, capped at four slots.
GEMINI_REQUEST_TIMEOUT_MS=60000: Gemini request timeout.
GEMINI_KEY_COOLDOWN_MS=60000: per-slot cooldown after retryable errors.
AGENT_AUTO_SCAN=true: enable checks in watch mode.
AGENT_SCAN_INTERVAL_MINUTES=30: interval in minutes, bounded to 5-1440.
AGENT_AUTO_FIX_SAFE_BUGS=true: enable guarded repair after failed checks.
AGENT_MAX_REPAIR_ATTEMPTS=3: maximum repair iterations, bounded to 1-3.
AGENT_AUTO_PUSH=false: keep verified branch local unless enabled explicitly.
AGENT_CHECK_TIMEOUT_MS=900000: per-check timeout, bounded by code.

The model cannot ask the host to execute arbitrary shell commands. Only the predefined project checks run.
