# MyNutri AI — Implementation Plan

Branch: `main`
Repository: https://github.com/18110priyanshuraj-creator/Nutrition
Last updated: 2026-10-14

The latest verification state and the durable requirement checklist are in [`CONTINUATION_STATUS.md`](./CONTINUATION_STATUS.md). In particular, local lint/typecheck/tests/build and authenticated production API smoke checks passed; live Gemini `generateContent` remains blocked by a network timeout despite successful model listing.

Use the companion `docs/CONTINUATION_STATUS.md` as the audit snapshot. A checked box means the source change or audit task is complete; it does **not** imply runtime verification unless the status record names a real successful command or CI result.

## Gemini and photo-analysis repair — 2026-10-13

- [x] Inspect the current branch/worktree and preserve the pre-existing `AGENTS.md` edit.
- [x] Reproduce the provider failure with a minimal live request and inspect only sanitized API error details.
- [x] Confirm the root cause: `.env.local` contained the model display name, which Gemini rejected with HTTP 400 `INVALID_ARGUMENT` (`unexpected model name format`); correct only that ignored local setting to an API model ID returned by the configured project's model list.
- [x] Use one provider/keyring for app workflows and coding-agent requests; prefer the last healthy slot, preserve numbered-slot order, retain the legacy fallback, bound retries to three extra attempts by default, and centralize timeout behavior.
- [x] Make provider status distinguish unconfigured, invalid model, untested, healthy, and failed states without exposing raw provider details or credentials; make refresh a no-cost status read.
- [x] Add deterministic tests for key/model configuration, failover, cooldown, retry limits, status health, image bytes/schema proposal handling, and unsupported images.
- [x] Complete an earlier live minimal Gemini provider test and verify an authenticated dashboard and Settings provider-test request against an isolated SQLite database.
- [ ] Reconfirm live Gemini health after the final provider changes; the final single preflight timed out, while the earlier request succeeded.
- [ ] Capture a caller-visible synthetic food-image proposal response; the dev server logged HTTP 200, but the client timed out waiting for the slow model response.
- [ ] Complete browser automation and an actual user food-photo verification; do not infer visual-recognition quality from the synthetic image.
- [x] Run `npm run agent:doctor` and an isolated `npm run db:migrate`; record exact results in `docs/CONTINUATION_STATUS.md`.

## P0 — Recover the actual Codespace state safely

- [ ] Open `/workspaces/Nutrition` and record `git status --short --branch`, HEAD SHA/message, remotes, `git diff`, and untracked files.
  - Acceptance: local and remote SHAs are recorded separately; no user-owned edit is discarded.
- [ ] Inspect the reported local `.env.example` modification and untracked `package-lock.json`.
  - Acceptance: the diff and lockfile intent are understood; preserve them unless a deliberate, reviewed change is agreed.
- [ ] Confirm `AGENTS.md`, `README.md`, `package.json`, migration files, CI and deployment files match the intended branch.
  - Acceptance: discrepancies are recorded before syncing or changing files.

## P1 — Run baseline checks and close verified defects

- [ ] Run the food-import regression test added in `tests/food-import.test.ts` and run the full suite with `npm test`.
  - Acceptance: unknown nutrient keys fail with a clear error before database mutation; all existing tests pass; failures are fixed with regression tests rather than weakened.
- [ ] Run `npm run typecheck`; specifically verify the `readJson<string[]>(..., "[]")` fallback issue is absent locally.
  - Acceptance: no TypeScript errors remain; recorded output comes from the actual Codespace.
- [ ] Run `npm run lint` and `npm run build`.
  - Acceptance: both commands pass, with warnings/errors recorded and fixed where actionable.
- [ ] Audit request validation in the profile/target, measurement, meal and note routes.
  - Acceptance: only known nutrient keys can be saved; numeric/date limits are coherent; impossible dates return a clear 4xx response rather than falling through to an unrelated default query; writes are transaction-safe where multiple rows are involved.
- [ ] Extend auth and API regression coverage.
  - Acceptance: login rate-limit behavior, invalid/expired sessions, unauthenticated access to private APIs, profile/target changes, measurement date filters, meal edit/delete and destructive deletion confirmation are tested with isolated fixtures.
- [ ] Extend analysis tests with a mocked Gemini SDK and crafted image/request fixtures.
  - Acceptance: malformed model output is rejected; MIME is detected from bytes; oversized/unsupported uploads fail; quotas/timeouts/missing credentials return sanitized errors; proposals remain editable and are never persisted without confirmation.
- [ ] Run all new/affected tests and repeat relevant broader checks after each repair.
  - Acceptance: command names, exit codes and results are recorded in `docs/CONTINUATION_STATUS.md`.

## P1 — Validate database migrations and data integrity

- [ ] Run `npm run db:migrate` on a disposable fresh database by setting `DATABASE_PATH` to a temporary file.
  - Acceptance: migrations 0001–0004 complete and a second run is safe.
- [ ] Exercise upgrades from the previous schema against a separate disposable database populated with fixture rows.
  - Acceptance: migration records are correct, existing meal/profile/target rows survive, indexes and foreign keys are present, and no live database is reset.
- [ ] Audit first-run seed behavior and imported-food upserts.
  - Acceptance: user data is preserved; imported records retain provenance; unknown nutrients and unsupported unit conventions are rejected or explicitly modeled; duplicate IDs/names are reported clearly.
- [ ] Verify export/restore and deletion end to end on disposable data.
  - Acceptance: JSON round-trip preserves profile, targets, meals, snapshots, measurements, notes, custom foods, recipes and source metadata; malformed/duplicate input causes no partial writes; deletion removes only the documented personal data.

## P1 — Privacy, authentication and operational safety

- [ ] Review route authorization, cookie flags, session expiration, request size limits, cache headers and sanitized errors.
  - Acceptance: all personal data routes require a valid owner session; no secret or private record is exposed in a public response or log; login/provider requests have suitable rate limits for the actual hosting topology.
- [ ] Confirm `.gitignore` in the live Codespace excludes `.env`, SQLite/WAL files, photos, exports, logs and test databases.
  - Acceptance: final diff contains no credentials, personal nutrition data, private photos, database files or exports.
- [ ] Verify database path and backup/restore procedures.
  - Acceptance: documented backup is SQLite-consistent, an example restore succeeds on disposable storage, and migration/import steps require an appropriate backup before real data changes.

## P2 — Food-data quality and nutrition behavior

- [ ] Audit serving conversion units and the unknown-nutrient completeness rules.
  - Acceptance: gram scaling is deterministic; conversions remain explicitly estimated; unknown values stay unknown; empty data is not presented as zero intake.
- [ ] Audit target consistency and recommendations, including the existing 2,195 kcal macro-derived result versus the 2,400 kcal energy target.
  - Acceptance: discrepancy is visible and explained; the app does not silently adjust user targets or present them as medical prescriptions.
- [ ] Review adolescent safety copy and growth/body-size interpretation.
  - Acceptance: no diagnosis from logs, height-gain promise, growth-hormone advice, unsafe supplement megadoses, or adult-BMI-only adolescent conclusions.
- [ ] Find and verify a suitable traceable food-composition dataset and its usage rights before import.
  - Acceptance: source/edition/license, source record ID, edible/preparation basis, original and canonical units and conversions are documented; dry run and disposable-database import pass. If no suitable licensed dataset is available, keep provisional status visible and record the blocker; do not fabricate verified values.

## P2 — UI and real-user-flow checks

- [ ] Run the app in a browser on mobile and desktop.
  - Acceptance: login, dashboard, manual food logging, editable AI proposals, history, measurement/profile updates, recipes, notes, trends, export, restore and deletion screens work against real routes, not static placeholders.
- [ ] Check accessibility and browser/server reliability.
  - Acceptance: keyboard operation, labels, focus, loading/empty/error states, responsive layout, hydration, console and network errors are reviewed and fixed.

## P2 — Gemini live verification

- [ ] With a valid private `GEMINI_API_KEY` and `GEMINI_MODEL`, test provider status, text parsing and image analysis on non-sensitive sample inputs.
  - Acceptance: a real request succeeds; configured model is honored; output is schema-validated; timeout/quota/auth failures are handled safely; no key, private photo or unnecessary personal data is logged.
- [ ] Without live credentials, run mocked tests and verify manual logging still works.
  - Acceptance: fallback tests pass and live testing remains explicitly marked blocked. Never claim live Gemini validation from mocks.

## P3 — Deployment readiness

- [ ] Build and start using the documented Docker/Compose process in an environment where Docker is available.
  - Acceptance: health endpoint succeeds, migrations run against persistent storage, and data survives container recreation.
- [ ] Verify deployment environment variables and persistent-volume/backup configuration on the actual host.
  - Acceptance: no secrets appear in the image or logs; `DATABASE_PATH` points to durable storage; a backup/restore drill succeeds.
- [ ] Confirm CI results for the final branch commit and review the complete diff.
  - Acceptance: tests, lint, typecheck and build are green; no secrets/private data or accidental deletions appear; status/plan reflect real checks; branch remains `codex/mynutri-ai-foundation`; do not merge to `main` automatically.

## Session exit checklist

- [ ] Update `docs/CONTINUATION_STATUS.md` with latest verified code commit, each exact command and exit/result, changed files, remaining blockers, and the next single action.
- [ ] Ensure this checklist matches the status record and no incomplete item is described as complete.
- [ ] Push only the reviewed, safe changes to `codex/mynutri-ai-foundation` when the authenticated environment supports it. Never reset/clean the working tree or force-push to resolve conflicts.
