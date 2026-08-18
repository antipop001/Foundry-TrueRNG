#!/usr/bin/env bash
# Pre-implementation cross-model review — the STANDARD gate for a fix Claude has BUILT but not yet
# committed or deployed. Antigravity/Gemini independently reviews the working-tree diff against the
# cited canon and returns APPROVE / REVISE, catching plausible-but-wrong changes the author's own
# model would rubber-stamp. It reviews ONLY — it never edits, commits, or deploys.
#
# Standard workflow:
#   1. Build the fix (edit the code; do NOT commit).
#   2. Write .agy-check/context.md — the bug, the intended behaviour, and the CANON citation
#      (the Foundry / random.org documentation that backs it). Or pass a path as $1.
#   3. tools/agy_check/agy_check.sh
#   4. Read .agy-check/verdict.md. On REVISE: address it and re-run. Only implement (commit/deploy)
#      once the verdict is APPROVE (or you have a documented reason to override a specific point).
#
# Env: CHECK_MODEL (default "Gemini 3.1 Pro (High)").
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
KIT="tools/agy_check"; OUT=".agy-check"
mkdir -p "$OUT"

command -v agy >/dev/null || { echo "ERROR: 'agy' (Antigravity CLI) not on PATH." >&2; exit 1; }

CTX="${1:-$OUT/context.md}"
[ -f "$CTX" ] || { echo "ERROR: context file '$CTX' missing. Write the bug + intended behaviour + CANON citation first (see the header)." >&2; exit 1; }
[ "$CTX" = "$OUT/context.md" ] || cp "$CTX" "$OUT/context.md"

# Make new (untracked) code files visible to the diff, without sweeping scratch / gitignored paths.
for f in $(git ls-files --others --exclude-standard -- src tests tools 2>/dev/null); do
  git add -N "$f" 2>/dev/null || true
done

# Capture the proposed change (exclude lockfile noise). Reviewed against HEAD, staged + unstaged.
git diff HEAD -- . ':(exclude)package-lock.json' ':(exclude)*.lock' ':(exclude)truerng.zip' > "$OUT/proposed.diff"
if [ ! -s "$OUT/proposed.diff" ]; then
  echo "ERROR: no uncommitted diff to review — build the fix first, and do NOT commit it before the check." >&2
  exit 1
fi

MODEL="${CHECK_MODEL:-Gemini 3.1 Pro (High)}"
# Hard wall-clock ceiling — agy's own --print-timeout has been observed to NOT fire (a run once hung
# ~22h producing nothing). `timeout` SIGKILLs the whole process group so it can never hang the workflow.
WALL="${AGY_CHECK_TIMEOUT:-1500}"   # seconds (25 min)
echo "== agy pre-implementation check · model: $MODEL · $(wc -l < "$OUT/proposed.diff") diff lines · hard cap ${WALL}s =="
rm -f "$OUT/verdict.md"
timeout -s KILL "$WALL" agy -p "$(cat "$KIT/check_fix.agy.md")" --model "$MODEL" --dangerously-skip-permissions --print-timeout 12m 2>&1 | tee "$OUT/agy_run.log"
rc=${PIPESTATUS[0]}
[ "$rc" = "137" ] && echo "!! agy exceeded the ${WALL}s hard cap and was killed — re-run, or check network/agy auth." >&2

echo; echo "== VERDICT =="
if [ -f "$OUT/verdict.md" ]; then
  cat "$OUT/verdict.md"
else
  echo "(agy wrote no $OUT/verdict.md — inspect $OUT/agy_run.log for its output)"
fi
