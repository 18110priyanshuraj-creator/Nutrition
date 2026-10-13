# Run the autonomous agent in GitHub Codespaces

Use this guide in the **existing** /workspaces/Nutrition Codespace. The upgrade runs on the current checkout and does not create or push branches.

## 1. Check the current worktree before syncing

```bash
cd /workspaces/Nutrition
git status --short
git branch --show-current
git fetch origin
git log -1 --oneline HEAD
git log -1 --oneline origin/codex/mynutri-ai-foundation
```

If git status --short shows files, preserve them before updating. The commands below keep a stash copy and do not reset/clean the checkout:

```bash
git stash push -u -m "backup-before-agent-upgrade-sync"
git fetch origin
git merge --ff-only origin/codex/mynutri-ai-foundation
git stash apply
git stash list
git status --short
```

- A fast-forward merge is deliberately used: if the local branch has diverged, Git refuses instead of rewriting history.
- git stash apply does not delete the backup stash. If Git reports conflicts, stop there; the stash is still available and files are not intentionally discarded.
- A stash does not contain ignored files such as .env or data/; it does not delete or replace them.

## 2. Configure Gemini privately

Set GEMINI_MODEL=gemini-3.5-flash-lite and at least one of GEMINI_API_KEY_1 through GEMINI_API_KEY_7 in the Codespace's private environment/secrets, or in the ignored local .env. Additional unique keys allow slot failover. The legacy GEMINI_API_KEY remains supported.

Never commit .env, paste a key into chat, or put a key in the task prompt.

## 3. Test connectivity before allowing file changes

```bash
npm install
npm run agent:upgrade -- --help
npm run agent:upgrade -- --preflight
```

The preflight makes one tiny live request, checks the configured model/key/API access, and does not edit source files. If it reports model_not_found, correct GEMINI_MODEL to a model your Google AI project can access. If it reports quota/billing exhaustion, rotating keys from the same project may not fix project-wide quota.

## 4. Run autonomous plan → inspect → edit → verify rounds

```bash
npm run agent:upgrade
```

By default it performs up to eight bounded rounds. A focused task can be supplied too:

```bash
npm run agent:upgrade -- "inspect the repository, fix evidenced bugs, add regression tests, and improve the agent without breaking existing features"
```

Each accepted patch runs the repository's fixed checks: lint, typecheck, unit tests and production build. The planner can request constrained read-only Git/search commands and those fixed checks, but arbitrary model-provided shell commands, installs, migrations, deploys, commits, pushes and merges are blocked. Changes stay uncommitted for review.

## 5. Review the result

```bash
git status --short
git diff --check
git diff --stat
git diff
npm test
npm run lint
npm run typecheck
npm run build
```

Reports and verified lessons are written locally under ignored .agent/upgrade-report.json and .agent/memory.json. Inspect the patch before committing anything.

## Branch cleanup

The old PRs are closed, but the remote-edit connector available in this workflow cannot delete branch refs directly. Once you have confirmed the active branch is up to date, remove only the two superseded remote refs with:

```bash
git push origin --delete feature/copilot-agent-upgrade codex/self-healing-agent
```

That command deletes the remote refs only; it does not delete your current branch or your working files.
