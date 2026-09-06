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

Bump application footer version and Service Worker `VERSION` in unison; never reuse cache keys for changed assets. Under D-027, verified user-requested TimeGrid implementation changes deploy automatically through `main` and Pages without a second approval; read-only work does not. Notion embed replacement remains outside task authority. Never leak credentials or raw UIDs.

## Product contract and change history

Before modifying application behavior, inspect the relevant contract in the live specification and its corresponding entry in [TimeGrid Patch Notes](https://app.notion.com/p/3d06337c669181739078c76cf6917152). Define expected behavior and establish a discriminating reproduction test before classifying any behavior as a defect. User-confirmed designs are strictly binding; modifying them requires an explicit superseding decision, not an assumption derived from general optimization authority.

Maintain the product specification and a dated Patch Notes entry within the same session. Document classification, affected contract IDs, before/after behavior, authority, preserved behaviors, verification scope, commit/artifact hashes, deployment state, and recovery steps. Strictly distinguish between Candidate, Verified-local, Deployed, Docs-only, and Rolled back statuses. Re-fetch Notion pages before critical writes and verify persisted results. Documentation or test-only changes do not constitute an application release.

C-TRACK-01 (D-015): Resuming the same measurement within 60,000ms inclusive bridges the gap into a continuous saved span and block. C-TRACK-02: Independent timestamp intervals sharing a rounded display minute must both be preserved without deletion. Treat these as complementary, coexisting contracts; execute `node tests/continuity.test.mjs` whenever measurement timing logic is modified.

D-018 / v3.14.1: Eligible restart projects a continuous block and total while
running, using shared `continuity-core.js`; raw session start/ID and atomic Stop
remain authoritative. Different free notes remain separate; metadata-only edits
reconcile eligible neighbors while preserving exact outer bounds/lineage. Treat
canonical, pending and active measured time as occupied when bridging a gap.
True minute-time edits detach lineage; missing imported fragments are not rebuilt.
Run `tests/live-continuity.test.mjs`, transactions and time-display tests too.
Release/activation evidence: `../TimeGridAutomation/memory/knowledge/live-continuity-coaching-20260903.md`.

## Deployed historical event linking repair — 2026-09-06

v3.14.6 is deployed from `main` commit
`9280231f3e5c312e87ab1371d20ac285b4e0b176`; Pages run `34014767026`
succeeded and all six public runtime assets matched Git bytes. Historical event
editing must query Todo/Routine candidates from the recorded event date, not the
wall-clock date. Explicit selection persists stable `todoId`/`routineId` across
the existing logical span while preserving exact identity and bounds; it never
implies completion. See [release and recovery evidence](RELEASE-2026-09-06-V3.14.6.md).
Run `tests/event-linking.test.mjs` and `tests/event-linking.browser.mjs` for this
surface in addition to continuity and import-identity checks.

## Deployed adversarial-audit repair — 2026-09-06

v3.14.5 is deployed from repair commit
`d7a84136eb0db31999b78d6b15d3312d45859b47`, first published on `main` at
`843099d9773dc1c1fc6c94bbaac5208260025929`; Pages run `34012665760`
succeeded and all six public runtime assets matched Git bytes. See
[audit and recovery evidence](AUDIT-2026-09-06.md). Preserve exact
log/linked-ID roundtrips, additive backup identity
and mutation preservation with overlap rejection, ID-based routine editing and
legacy migration, UID+auth-generation sync fences, owned SW caches, guarded
updates and completed view-animation cleanup. New regressions are in
`import-integrity`, `routine-editor`, `sync-session`, `pwa-lifecycle`, and
`real-bootstrap` tests; related existing contract tests still apply.

## Current contracts

Verified production baseline (2026-09-06): v3.14.7 (main commit `ef9d31569ffa3e2b11ea30db84d0f030570b3344`).
- Pages run `34016960609` succeeded and six public runtime assets matched Git bytes. Cache `timegrid-v3.14.7-20260906`; 131 Node checks, four real-bootstrap contexts and actual delayed old-to-new Chromium upgrade/reload passed. Native iPhone/WebKit and authenticated multi-device E2E remain unverified. Evidence: `RELEASE-2026-09-06-V3.14.7.md`; v3.14.6/v3.14.5 reports retain their historical evidence. Automation0.19.2 and protocol-2 remain unchanged.
- PWA updates require page/worker build identity, controller-confirmed reload and activated-shell HTML. Reject mismatched install HTML; preserve running/pending Stop guards and inert hidden controls. Run `tests/pwa-lifecycle.test.mjs`, `tests/pwa-update.browser.mjs`, `tests/pwa-upgrade.browser.mjs` and real-bootstrap for this surface. Never restore a blind reload timer or reuse cache identities.
- C-TODO-01 (D-021): Existing date actions move unmeasured unfinished Todos with stable IDs. Any linked recorded event requires preserving the source Todo, events and completion while creating a fresh unchecked target with allowlisted planning fields and scalar `continuationOf`. Reuse observed target lineage without overwriting edits; independent offline-device dedup is not guaranteed. Running/pending finalization stays guarded; completed unmeasured behavior is unchanged. No Copy menu or standing explanatory banner. Undo revalidates current target content, measurements and lifecycle mutations; new mutation timestamps advance beyond the latest observed stamp. Existing Firestore/Notion creation owns the new ID; no new writer, mutation kind or migration. Tests: `tests/todo-date.test.mjs` and isolated `tests/todo-date.browser.mjs`.
- C-SYNC-01: Measurement and sync scope are independent. Tracker shows actionable warnings only; healthy/pending prose stays hidden, with detail in the account panel. Connection wait uses the existing timer control, not a duplicate badge. Failed initial bootstrap retries on resume/online/interval and coalesces concurrent attempts. Keep account expectation across passive auth loss; explicit logout selects local mode. Preserve local sessions and outbox. Confirm receipt only from a matching running server read/transaction with no pending timer operation, never a cached/pending-write callback. Automation cloud absence cannot establish device inactivity; acquisition and mutation timestamps remain separate. Run `node tests/sync-observation.test.mjs` and `tests/timer-sync.test.mjs` for auth/sync changes.
- C-CATALOG-01 (D-016/D-017): Settings arrays own live area/activity order and stable IDs; lastUsed never reorders. Delete removes live entries; immutable catalogHistory receipts retain minimal historical identity. Current Todo/routine assignment keeps the parent after activity deletion or clears both fields after area deletion; blank remains the initial empty control. Events and completion logs survive. Rename/move/recolor keep dynamic historical projection. Same-name recreation has new IDs. No archive/restore UI or automatic reassignment. Fresh seeds never replace an existing or deliberately emptied catalog. Tests: catalog-lifecycle, catalog-import, catalog-transactions, catalog-manager, and Automation catalogAdapter/catalogLifecycleMigration.
- C-SYNC-02: User Stop captures its endpoint before I/O and publishes a durable intent without a whole-history barrier. A coalesced, prioritized atomic finalizer reads latest source days/ack, three-way merges queued source-day edits before continuity, and writes canonical exact spans, immutable finalizationAcks and pending removal together. Next shared Start waits for pending finalization; ordinary historical uploads do not lock confirmed timer actions. Pending display-only spans never enter generic day uploads and block affected editing/deletion. Minute-resolution edits reserve the entire minute touched by pending exact time. Protocol/sequence/revision fences reject stale writers; a migration guard permits only manual Stop of the exact legacy live timer. Preserve receipts, acks and recoverable local outboxes. Tests: catalog-finalization, catalog-transactions, timer-sync and actual Firestore emulator catalog-rules when rules change.
- D-020 / C-SYNC-02 completion: Positive immutable acknowledgments own pending removal, persistence and immediate rendering. Account-scoped, session-local ack evidence prevents stale pending/guard resurrection; reload checks canonical acks. The running listener includes metadata changes and directly observes pending ack IDs on server-confirmed events independently of historical uploads. Each positive read applies without waiting for another stalled ID; failed/missing/cached evidence never unlocks Start. Ignore late previous-account callbacks. Run `tests/stop-ack.browser.mjs` against the synthetic fixture as well as timer/transaction tests; server commit timing alone is not UI completion evidence.
- C-MOTION-01: Latest requested state owns interruptible motion; semantic selection does not wait for animation. Share bounded, cancellable cleanup across GSAP/CSS/WAAPI; preserve intentional week timing and instant routine filters. Catalog grips own touch gestures on a stable list; preview reorders DOM only, drop persists IDs, cancel restores order. Prevent native selection during drag while preserving editor selection; stationary taps and keyboard activation open one menu. Use180ms FLIP/landing with immediate keyboard/reduced-motion cleanup; height-only viewport changes do not cancel drag. Mobile drill-in has no retained selection fill; desktop master/detail does. Kind/date/instance hover unifies fragments without conflating duplicate names. Tests: `tests/motion-lifecycle.test.mjs`, `tests/catalog-touch.browser.mjs` with/without GSAP.
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
