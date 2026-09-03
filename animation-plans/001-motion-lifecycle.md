# 001 — Make motion interruption-safe

- Status: VERIFIED LOCAL (2026-09-03)
- Baseline: fbb9b21 (v3.13.6)
- Severity: HIGH
- Categories: Interruptibility, accessibility, ownership, cohesion
- Scope: index.html and extracted production regression tests; no new dependencies

## Problem / target

| Before | After | Why |
|---|---|---|
| renderStWeek compares only settled weekStripDates | Track requested window; retarget from current transform | A→B→A must not snap or finish B later |
| CSS fallback / closeFsPanelRight wait only for transitionend | Cancellable, bounded, idempotent completion; exact target/property filter | Suppressed or missing events cannot strand state |
| rwScrollTo kills tweens without resetting _rwSquelch | One cancellation path restores input; old field callbacks cannot commit | Controls remain usable after interruption |
| Delayed sidebar close removes a reopened overlay | Cancel old close before opening | Latest intent owns lifecycle |
| Routine strips only have local :hover | Shared kind/date/instance identity for all fragments | One routine remains one interaction |
| CSS and GSAP compete on control/popup transforms | Single owner or cancel CSS entrance before imperative exit | No blink/reset under rapid selection |

## Repo conventions / exact values

Use existing GS (optional GSAP) and rmPref. Preserve the explicit specification's
week dial curve and 1.12–2.25s travel, fixed24h scale, no-animation routine filter,
resize suppression and timer continuity. Simple feedback uses existing --dur-1
(.15s), --dur-2 (.25s), new shared --ease-out cubic-bezier(0.23,1,0.32,1).
Pointer grouping requires (hover:hover) and (pointer:fine); reduced motion must
finish synchronously. Lifecycle timers are fallbacks, not action delays.

## Steps

1. Separate requested week dates from settled dates; preserve current transform
   on cancellation in both GSAP/CSS paths. Scope cleanup per request, ignore old
   callbacks, immediately finish reduced/zero-distance transitions.
2. Make panel/sidebar open-close cancellation symmetric; filter transition target
   and property and provide bounded completion for no event.
3. Reset wheel suppression and delayed commits on field changes/close/manual
   interaction. Restore calendar scroll-snap after every cancellation branch.
4. Give event/routine/todo fragments one namespaced data-hover-key; delegate
   pointerover/out and keep child/fragment transitions in the same group.
5. Audit all GSAP entry points for reduced motion and CSS property ownership;
   remove transition:all and duplicate control pulse transforms. Preserve data.

## Verification

Run node tests/motion-lifecycle.test.mjs plus all tests/*.test.mjs and extracted
inline-script syntax. Test A→B→A and repeated same mode while moving, Sunday
identical date windows, CSS fallback without GSAP with/without reduced motion,
missing/descendant transition events, reopen during close, wheel field switch,
calendar interruption and logical hover for duplicate names. Browser QA on mobile
and desktop checks settled geometry, no stranded opacity, fine vs coarse pointer
and reduced-motion. Slowed playback/frame samples check smooth intermediate
transforms; production user timers and records are never a test fixture.

Done only with scoped source review, regression evidence and rendered interaction
checks. Do not alter workout prescriptions, queues, authentication privileges or
measurement history. Main agent owns implementation after this read-only audit.

## Observed results

All14 app programs pass, including real bootstrap order, exact timestamp continuity,
CSS completion/cancellation, wheel field switching, stale calendar callbacks,
transform-only drag geometry and namespaced hover. Browser fixture verified GSAP
and no-GSAP rapid week reversal, keyboard settling, mobile/desktop layout and
three-fragment routine hover isolated from a second same-name routine. Intentional
week timing, instant routine filters and fixed24h scale remain unchanged.
Authenticated multi-device and actual iPhone tests were not performed.
