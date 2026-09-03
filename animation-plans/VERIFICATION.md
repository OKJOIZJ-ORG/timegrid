# Catalog and motion verification

Audience: maintenance AI with Node, PowerShell and the checked-out TimeGrid repository.
This procedure verifies local code; it does not authorize deployment or live data changes.

1. Work in `C:\Users\jbs\Documents\TimeGrid`. Record `git branch --show-current` and
   `git status --short`. Preserve unrelated/untracked release artifacts.
2. Run every `tests/*.test.mjs` with Node, stopping on the first nonzero exit.
   In PowerShell: `foreach($test in Get-ChildItem tests -Filter '*.test.mjs'){ node $test.FullName; if($LASTEXITCODE -ne 0){throw $test.Name} }`.
   Expected:14 passing programs, including live SRI and extracted `node --check`.
   These tests use synthetic state; temporary syntax files are cleaned up.
3. In `C:\Users\jbs\Documents\TimeGridAutomation`, run
   `node --import tsx catalogMaintenance.test.mjs`. It must pass without credentials
   or cloud writes. It covers the one-time catalog plan, reference guards, existing
   Notion projection parity and unchanged measurement totals.
4. Compare against baseline commit `fbb9b21` with `git diff fbb9b21 --` followed by
   these exact task-owned paths: `index.html`, `sw.js`, `tests/release-contract.test.mjs`,
   `tests/sync-observation.test.mjs`, `tests/catalog.test.mjs`,
   `tests/motion-lifecycle.test.mjs`, `tests/syntax.test.mjs`,
   `tests/serve-fixture.mjs`, and `animation-plans/`. If new files are untracked,
   read them in full directly; Git diff does not include them until staged. Preserve
   unrelated `timegrid-v3.12.65.html` and `timegrid-v3.12.65.zip` without inspection,
   staging or removal. Run `git diff --check`. Do not reinterpret
   the intentional gap-inclusive60s restart or the1.12–2.25s week dial as defects.
5. Report actual commands/results and every blocking ambiguity. No pushes, live
   catalog migration, Notion edits, production timer interaction or Telegram sends.

Separate interactive evidence is recorded by the delivery owner:320/360/390/600/840/
1280px input symmetry; mobile Todo center; GSAP and CSS week reversal; keyboard
settling; whole-routine hover with duplicate-name separation; archive/restore keeps
historical totals. This procedure does not substitute for real-phone or coordinated
authenticated multi-device testing.

## Rehearsal log (observed 2026-09-03)

- Round1: fresh maintenance-AI executed14 app programs and the catalog migration
  test successfully. Diff review stalled because baseline/untracked scope was
  ambiguous. Step4 now states the baseline, exact paths and preserved artifacts.
- Round2,18:48 KST: another fresh maintenance-AI executed every step, read the
  complete scoped diff and seven new files, and reported no stalls or guesses.
  Tests14/14 plus migration passed; diff check passed; no state mutation.
- Delivery owner also ran all45 Automation package programs, including the newly
  integrated migration test. All returned exit0. Browser checks are separate.
