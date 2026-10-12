# Self-healing repository agent

This is a guarded maintenance CLI added to the existing MyNutri app. It uses the project's existing Node/TypeScript setup, Vitest and Google Gemini SDK. It does not replace the nutrition calculation engine.

## Run it

- \`npm run agent -- --help\` — list commands.
- \`npm run agent -- doctor\` — run lint, typecheck, tests and production build; it does not edit source.
- \`npm run agent -- scan\` — run checks, then attempt a bounded safe repair if checks fail.
- \`npm run agent -- fix\` — same as scan, but intended to focus on current check failures.
- \`npm run agent -- "task description"\` — ask Gemini to make a scoped change, then verify it.
- \`npm run agent:watch\` — keep the background monitor running in this Codespace terminal.
- \`npm run agent -- status\` — view sanitized Gemini provider/key-slot status.
- \`npm run agent -- memory\` — view local run summaries and verified lessons.
- \`npm run agent -- memory clear\` — clear only the local agent memory.

The background watcher runs only while its process/Codespace remains alive. It skips expensive checks/audits when the repository fingerprint has not changed. On each source change, it runs checks and, when Gemini is configured, a cautious AI bug audit. A scheduled GitHub Actions workflow is separate from this local monitor.

## Four-key Gemini failover

Configure private server-side environment variables:

- \`GEMINI_API_KEY_1\`
- \`GEMINI_API_KEY_2\`
- \`GEMINI_API_KEY_3\`
- \`GEMINI_API_KEY_4\`
- \`GEMINI_MODEL\`

The previous \`GEMINI_API_KEY\` variable remains a fallback when no numbered slot is set. Never commit secret values or expose them in logs.

Timeouts, network errors and key-specific credential errors rotate to another available slot. Rate-limit responses also try a bounded number of slots, but Gemini rate limits are project-scoped: keys from the same Google AI project share quotas, so rotation only helps when another slot has a usable independent project/quota. Explicit project-wide quota or billing errors, invalid models and invalid requests stop early. Cooldowns and the last successful slot are held in server-process memory and reset when the process restarts.

## Safety model

- The agent operates on the current checked-out branch only. It never creates branches, commits, pushes, or merges.
- Existing uncommitted and untracked work is preserved. A tracked file already modified by a person is ineligible for an automatic patch.
- Automatic edits are restricted to clean, existing TypeScript/TSX app and test files. Auth/session, database/schema/migrations, restore endpoints, environment files, dependency configuration/lockfiles, workflows and agent core are protected.
- Each candidate patch must pass \`git diff --check\`, lint, typecheck, tests and production build. When verification fails, only that patch is reverted, and only if the file still exactly matches the agent's proposal.
- The agent makes at most three repair attempts by default. A passing repair remains uncommitted on the current branch so the diff can be reviewed first.
- The local \`.agent/memory.json\` stores bounded run summaries and lessons from verified, passing repairs. It does not store API keys, meal records, photos, database contents or full diagnostic output. The model cannot edit the agent core.
- This is guarded automation, not a promise that every issue can be repaired automatically. Review generated diffs before committing.

## Environment controls

- \`GEMINI_MODEL\`: required model name; model is not hard-coded.
- \`GEMINI_API_KEY_1\` … \`GEMINI_API_KEY_4\`: private key slots.
- \`GEMINI_API_KEY\`: legacy fallback.
- \`GEMINI_MAX_RETRIES=3\`: extra key attempts, capped at four total.
- \`GEMINI_REQUEST_TIMEOUT_MS=60000\`: model request timeout.
- \`GEMINI_KEY_COOLDOWN_MS=60000\`: cooldown for a failing key slot.
- \`AGENT_AUTO_SCAN=true\`: enable scans in watch mode.
- \`AGENT_SCAN_INTERVAL_MINUTES=30\`: monitor interval (minimum five minutes).
- \`AGENT_AUTO_FIX_SAFE_BUGS=true\`: allow repairs following failed checks.
- \`AGENT_MAX_REPAIR_ATTEMPTS=3\`: repair attempts, bounded to 1–3.
- \`AGENT_CHECK_TIMEOUT_MS=900000\`: per-check timeout, bounded by the program.

Only the fixed project check scripts are executed. Gemini cannot ask the host to execute arbitrary shell commands.
