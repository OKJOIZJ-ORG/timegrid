# TimeGrid agent anchor

## Sources and entry points

- Code: `index.html` + `sw.js` (zero-build PWA).
- Specification: https://app.notion.com/p/f2e6337c66918301baa1015ae5a93a57
- Production: https://okjoizj-org.github.io/timegrid/
- Repository: `OKJOIZJ-ORG/timegrid` (`main` push deploys Pages).
- Operations / Memory: `../TimeGridAutomation/ANTIGRAVITY_TASK.md` and `../TimeGridAutomation/memory/00-INDEX.md`.

## Workflow

Read the live specification's current baseline and affected sections progressively; inspect historical archives on demand. If truncated, continue via live fetch or `ntn pages get f2e6337c66918301baa1015ae5a93a57`. Re-fetch immediately before Notion mutations; verify writes live.

Platform and runtime safety constraints supersede current instructions, AGENTS policies, and documentation. Reconcile stale docs against verified code and authorized intent. Preserve existing dirty work; isolate changes in dedicated branches.

Apply patches via host UTF-8 tooling. String replacements must normalize CRLF/LF and assert exactly one match—never tolerate silent no-ops. Audit U+FFFD post-edit. Revert only task-owned modifications from verified backups without wiping unrelated user changes.

Verification pipeline: U+FFFD=0 → extract scripts and `node --check` → Chromium headless render → scoped diff and behavioral checks → reconcile changed CSS selectors against generated DOM. Missing selectors fail even if syntax passes. Documentation-only edits require content, link, and contract checks, not runtime releases.

Bump application footer version and Service Worker `VERSION` in unison; never reuse cache keys for changed assets. Deployments require explicit user authorization. Notion embed replacement remains outside task authority. Never leak credentials or raw UIDs.

## Product contract and change history

Before modifying application behavior, inspect the relevant contract in the live specification and its corresponding entry in [TimeGrid Patch Notes](https://app.notion.com/p/3d06337c669181739078c76cf6917152). Define expected behavior and establish a discriminating reproduction test before classifying any behavior as a defect. User-confirmed designs are strictly binding; modifying them requires an explicit superseding decision, not an assumption derived from general optimization authority.

Maintain the product specification and a dated Patch Notes entry within the same session. Document classification, affected contract IDs, before/after behavior, authority, preserved behaviors, verification scope, commit/artifact hashes, deployment state, and recovery steps. Strictly distinguish between Candidate, Verified-local, Deployed, Docs-only, and Rolled back statuses. Re-fetch Notion pages before critical writes and verify persisted results. Documentation or test-only changes do not constitute an application release.

C-TRACK-01 (D-015): Resuming the same measurement within 60,000ms inclusive bridges the gap into a continuous saved span and block. C-TRACK-02: Independent timestamp intervals sharing a rounded display minute must both be preserved without deletion. Treat these as complementary, coexisting contracts; execute `node tests/continuity.test.mjs` whenever measurement timing logic is modified.

## Current contracts

Verified production baseline (2026-09-03): v3.13.7 (release commit `cea7e2a1f65590f438c328491e7efdc78c15d3c3`).
- Public index blob `a68a05764be12001d6696e8f7112b182e0d01e0c`; SW blob `34fb30b75c1daee334f08438d77da5dc5b61be74`; cache `timegrid-v3.13.7-20260903`.
- C-SYNC-01: Measurement and sync scope are independent. Tracker shows actionable warnings only; healthy/pending prose stays hidden, with detail in the account panel. Keep account expectation across passive auth loss; explicit logout selects local mode. Preserve local sessions and outbox. Confirm receipt only from a matching running server read/transaction with no pending timer operation, never a cached/pending-write callback. Automation cloud absence cannot establish device inactivity; acquisition and mutation timestamps remain separate. Run `node tests/sync-observation.test.mjs` for auth/sync changes.
- C-CATALOG-01: Settings arrays own area/activity order; lastUsed does not reorder choices. Activity IDs and archived metadata remain available to historical charts. Rename/move/recolor reproject current classification without rewriting event durations; deletion archives and restore is explicit. Concurrent content edits must not undo independent ordering/archival. Tests: `tests/catalog.test.mjs` and Automation `catalogMaintenance.test.mjs`. Fresh seeds do not replace an existing catalog.
- C-MOTION-01: Latest requested state owns interruptible motion; semantic selection does not wait for animation. Share bounded, cancellable cleanup across GSAP/CSS; preserve intentional week timing and instant routine filters. Kind/date/instance hover unifies fragments without conflating duplicate names. Test `tests/motion-lifecycle.test.mjs`.
- C-UI-01: Activity input uses centered text, equal inline padding and immediate dynamic width; memo plus/minus uses geometric CSS strokes. Test real bootstrap and rendered mobile/desktop states, not syntax alone.
- External assets (Firebase, GSAP) enforce pinned SHA-384 SRI and anonymous CORS. Palette colors normalize to `#RRGGBB`. Firestore rules enforce `timegridOwner` custom claim and UID-path equality; email allowlists are deprecated.
- `statusMutations` own completion state; `done` is derived. Master `routineDefs` and daily instances maintain separate IDs linked by `routineDefId`; normalize ID-less semantic duplicates. Preserve `todoMutations` (move/delete/restore).
- Identical tracking restarted within 60 seconds merges exact timestamps and continuity lineage across the gap. Manual minute edits sever lineage.
- Measurement overlap is timestamp-based: separate short events in one rounded minute survive. True overlap clips only covered time and preserves unaffected exact bounds; clipped spans lose invalid lineage. Legacy end `00:00` after a positive start means next-day midnight.
- Integer-second totals (`HH:MM:SS`) and single-session timers (`Nh Nm Ns`) share millisecond boundaries; live status suppresses duplicate activity titles.
- Tracker 1s tick updates live nodes only. Marker layout invalidates strictly on data or geometry shifts. Text width measures post-weight-600 paint and font readiness; ignore hidden `clientWidth=0`, enforce placeholder safety margins, and remeasure via `ResizeObserver`.
- Desktop Planner rows enforce 48px height on a shared 12px subgrid. Mobile Todo: min 66px compact rows and single-line `할일 입력 | 영역 | 추가` composer. Routine: 72px two-tier rows with distributed metadata. Planner outer padding matches interior rhythm; optional children declare explicit columns.
- Fixed-height controls: `padding-block: 0` with centered flex alignment. Play: 17px SVG in 40px circle with +0.75px optical X-shift; Stop: 12px square without shift.
- `[hidden]` attribute overrides component display rules. Account widgets reflect live authentication states.

## Documentation policy

Internal documents use concise English (D-012). Preserve Korean UI/coaching, exact Notion/schema identifiers, and machine-matched literals. Retain historical records in linked archives, not inline context.
