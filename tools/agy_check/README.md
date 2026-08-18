# agy_check — cross-model pre-implementation review

An independent reviewer (Google Antigravity / Gemini) reads a fix that has been **built but not
committed** and returns `APPROVE` / `REVISE`. It catches plausible-but-wrong changes that the
authoring model would rubber-stamp — especially wrong assumptions about the Foundry VTT and
random.org APIs, which this repo has no test suite to catch.

## Workflow

1. Build the fix. Do **not** commit it.
2. Write `.agy-check/context.md`: each bug, the intended behaviour, and the documentation that
   backs it (a Foundry v14 API / release-note or random.org JSON-RPC URL).
3. Run `tools/agy_check/agy_check.sh`.
4. Read `.agy-check/verdict.md`. On `REVISE`, address it and re-run. Commit only on `APPROVE`, or
   with a documented reason for overriding a specific point.

The reviewer never edits, commits, or deploys — it reviews only.

`.agy-check/` is scratch output and is gitignored. `CHECK_MODEL` (default `Gemini 3.1 Pro (High)`)
and `AGY_CHECK_TIMEOUT` (default 1500s hard cap) override the defaults.
