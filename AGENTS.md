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

## Current contracts

Verified production baseline (2026-09-03): v3.13.5 (release commit `849167be1610049dc7bfd1a66ec7cc12dc8c2039`).
- Public index blob `907c0d3bd1624dd48c64c93cf618b1763f57fd77`; SW blob `ebd4f5d629ff99ca63574b1614574bec80e12f2d`; cache `timegrid-v3.13.5-20260903`.
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
