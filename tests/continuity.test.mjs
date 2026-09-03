import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import TG_CATALOG from '../catalog-core.js'
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const start = html.indexOf("/* CONTINUITY_CORE_START */")
const end = html.indexOf("/* CONTINUITY_CORE_END */")
assert.ok(start >= 0 && end > start, "continuity core markers must exist")
assert.match(html, /startTs:piece\.startTs,[\s\S]*endTs:piece\.endTs,[\s\S]*continuityId:spanId/, "canonical events retain exact time and lineage")
assert.match(html, /fragmentCount:pieces\.length/, "midnight spans retain one logical lineage across physical day fragments")
assert.match(html, /Number\(endTs\)>Number\(r\.startTs\)&&!materializeExactSpan\(r,Number\(endTs\)\)/, "positive stop spans use exact continuity; zero spans don't fabricate time")

const source = html.slice(start, end) + "\n;globalThis.__core=TG_CONTINUITY;"
const context = { console, Date, JSON, Map, Set, Math }
vm.createContext(context)
vm.runInContext(source, context)
const core = context.__core
const previous = { actId: "a1", todoId: "t1", startTs: 1000, endTs: 20_000 }
assert.equal(core.decide(previous, { ...previous, startTs: 79_000 }).merge, true)
assert.equal(core.decide(previous, { ...previous, startTs: 80_000 }).merge, true)
assert.equal(core.decide(previous, { ...previous, startTs: 81_000 }).merge, false)
assert.equal(core.decide(previous, { ...previous, actId: "a2", startTs: 21_000 }).merge, false)
assert.equal(core.decide(previous, { ...previous, todoId: "t2", startTs: 21_000 }).merge, false)
assert.equal(core.same({ actId: "a1", note: "same  note" }, { actId: "a1", note: " same note " }), true)
assert.equal(core.same({ actId: "a1", routineId: "r1" }, { actId: "a1", routineId: "r2" }), false)
const midnightStart = new Date(2026, 8, 1, 23, 59, 30).getTime()
const midnightEnd = new Date(2026, 8, 2, 0, 0, 30).getTime()
const midnightPieces = core.splitSpan(midnightStart, midnightEnd)
assert.equal(midnightPieces.length, 2, "a cross-midnight exact span must split into two storage fragments")
assert.equal(Array.from(midnightPieces, piece => piece.date).join(","), "2026-09-01,2026-09-02")
assert.equal(midnightPieces[0].endTs, midnightPieces[1].startTs, "cross-midnight fragments are gapless")

// Exercise the actual writer, not just its continuity decision helpers.
const intervalStart = html.indexOf("const EXACT_EVENT_KEYS=")
const intervalEnd = html.indexOf("function freeRanges(", intervalStart)
assert.ok(intervalStart >= 0 && intervalEnd > intervalStart, "interval writer must be extractable")
function fixture() {
  let sequence = 0
  const state = { days: {} }
  const writer = {
    state, Date, JSON, Map, Set, Math, TG_CATALOG,
    uid: prefix => `${prefix}_${++sequence}`,
    toMin: clock => { const [h, m] = clock.split(":").map(Number); return h * 60 + m },
    hhmm: minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
    dateOf: date => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d) },
    ensureDay: date => state.days[date] ||= { events: [], todos: [], routines: [] },
  }
  vm.createContext(writer)
  vm.runInContext(html.slice(start, end) + html.slice(intervalStart, intervalEnd), writer)
  return {
    state, writer,
    record: (actId, startTs, endTs, extra = {}) => {
      assert.equal(writer.materializeExactSpan({ actId, startTs, sessionId: `s_${++sequence}`, ...extra }, endTs), true)
    },
    events: date => state.days[date]?.events || [],
    totalMs: () => Object.values(state.days).flatMap(day => day.events).reduce((sum, event) => sum + (event.endTs - event.startTs), 0),
  }
}
const date = "2026-09-03"
const base = new Date(2026, 8, 3, 10, 0, 0).getTime()

// C-TRACK-01: accepted product intent, confirmed by the user on 2026-09-03.
// This gap is deliberately counted. It is distinct from timestamp-overlap repair.
for (const gapMs of [0, 59_999, 60_000, 60_001]) {
  const f = fixture()
  f.record("a", base, base + 20_000)
  const first = { ...f.events(date)[0] }
  f.record("a", base + 20_000 + gapMs, base + 40_000 + gapMs)
  const joins = gapMs <= 60_000
  assert.equal(f.events(date).length, joins ? 1 : 2, `C-TRACK-01: ${gapMs}ms boundary`)
  assert.equal(f.totalMs(), 40_000 + (joins ? gapMs : 0), "eligible gaps count exactly once")
  assert.equal(f.events(date)[0].id, first.id, "the original event identity survives")
  if (joins) {
    const event = f.events(date)[0]
    assert.equal(event.startTs, base)
    assert.equal(event.endTs, base + 40_000 + gapMs)
    assert.equal(event.continuityId, first.continuityId)
    assert.equal(event.gapIncludedMs, gapMs)
    assert.equal(event.sessionIds.length, 2)
  }
}

for (const [label, first, next, joins] of [
  ["same Todo", { todoId: "t1" }, { todoId: "t1" }, true],
  ["same Routine", { routineId: "r1" }, { routineId: "r1" }, true],
  ["different Routine", { routineId: "r1" }, { routineId: "r2" }, false],
  ["equivalent free note", { note: "read  chapter" }, { note: " read chapter " }, true],
  ["different free note", { note: "chapter 1" }, { note: "chapter 2" }, false],
  ["different link kind", { todoId: "same-id" }, { routineId: "same-id" }, false],
]) {
  const f = fixture()
  f.record("a", base, base + 20_000, first)
  f.record("a", base + 50_000, base + 70_000, next)
  assert.equal(f.events(date).length, joins ? 1 : 2, `C-TRACK-01 identity: ${label}`)
  assert.equal(f.totalMs(), joins ? 70_000 : 40_000, `C-TRACK-01 duration: ${label}`)
}

{
  const f = fixture()
  f.record("a", base, base + 20_000)
  const originalId = f.events(date)[0].id
  f.record("a", base + 50_000, base + 70_000)
  // Persistence roundtrip must retain the design contract, not reset its lineage.
  f.state.days = JSON.parse(JSON.stringify(f.state.days))
  f.record("a", base + 130_000, base + 150_000)
  const event = f.events(date)[0]
  assert.equal(f.events(date).length, 1, "C-TRACK-01: repeated resumes remain one event")
  assert.equal(event.id, originalId)
  assert.equal(event.gapIncludedMs, 90_000)
  assert.equal(new Set(event.sessionIds).size, 3)
  assert.equal(f.totalMs(), 150_000, "each eligible gap counts once after reload")
}

{
  const f = fixture()
  const midnight = new Date(2026, 8, 4).getTime()
  f.record("a", midnight - 40_000, midnight - 20_000)
  f.record("a", midnight + 20_000, midnight + 40_000)
  const pieces = Object.values(f.state.days).flatMap(day => day.events)
  assert.equal(pieces.length, 2, "C-TRACK-01: midnight needs two date storage fragments")
  assert.equal(new Set(pieces.map(row => row.continuityId)).size, 1, "one logical measurement across midnight")
  assert.equal(pieces[0].endTs, pieces[1].startTs, "storage fragments cover the restart gap without a hole")
  assert.ok(pieces.every(row => row.fragmentCount === 2 && row.gapIncludedMs === 40_000))
  assert.equal(f.totalMs(), 80_000, "the midnight restart gap counts once in elapsed time")
}

{
  const f = fixture()
  f.record("a", base, base + 20_000)
  const original = JSON.stringify(f.events(date)[0])
  f.record("b", base + 25_000, base + 45_000)
  assert.equal(f.events(date).length, 2, "distinct subminute sessions sharing one minute projection both survive")
  assert.equal(JSON.stringify(f.events(date)[0]), original, "non-overlapping physical measurements remain byte-identical")
  assert.equal(f.totalMs(), 40_000, "physical totals include both measured sessions, excluding the gap")
  f.record("a", base + 50_000, base + 55_000)
  assert.equal(f.events(date).length, 3, "an intervening activity prevents continuity across it")
  assert.equal(f.totalMs(), 45_000)
}
{
  const f = fixture()
  f.record("a", base, base + 20_000, { todoId: "t1" })
  f.record("a", base + 25_000, base + 45_000, { todoId: "t2" })
  assert.equal(f.events(date).length, 2, "distinct linked tasks retain independent intervals in the same minute")
  assert.equal(f.totalMs(), 40_000)
}
{
  const f = fixture()
  f.record("a", base, base + 20_000)
  const originalId = f.events(date)[0].id
  f.record("a", base + 80_000, base + 100_000)
  assert.equal(f.events(date).length, 1, "same-identity restart at the inclusive 60s boundary remains one span")
  assert.equal(f.events(date)[0].id, originalId, "continuity retains the existing event identity")
  assert.equal(f.events(date)[0].gapIncludedMs, 60_000)
  assert.equal(f.events(date)[0].sessionIds.length, 2)
  assert.equal(f.totalMs(), 100_000, "merged continuity counts the agreed restart gap")
  f.record("a", base + 160_001, base + 180_001)
  assert.equal(f.events(date).length, 2, "restart after 60s begins a distinct span")
}
{
  const f = fixture()
  f.record("a", base, base + 180_000)
  f.record("b", base + 70_000, base + 80_000)
  const rows = f.events(date)
  assert.equal(rows.length, 3, "true overlap splits only the covered physical interval")
  assert.deepEqual(Array.from(rows, row => [row.actId, row.startTs - base, row.endTs - base]), [
    ["a", 0, 70_000], ["b", 70_000, 80_000], ["a", 80_000, 180_000],
  ])
  assert.equal(f.totalMs(), 180_000, "true replacement neither drops uncovered seconds nor double-counts overlap")
  assert.ok(rows.filter(row => row.actId === "a").every(row => !row.continuityId && !row.spanStartTs && !row.sessionIds), "clipped remainders do not claim the uncut lineage")
}
{
  const f = fixture()
  f.record("a", midnightStart, midnightEnd)
  const leftBefore = JSON.stringify(f.events("2026-09-01")[0])
  f.record("b", midnightEnd + 10_000, midnightEnd + 20_000)
  assert.equal(f.totalMs(), 70_000, "the first minute after midnight preserves the preceding exact fragment")
  assert.equal(JSON.stringify(f.events("2026-09-01")[0]), leftBefore, "unaffected cross-midnight lineage remains intact")
  f.record("c", midnightEnd - 20_000, midnightEnd - 10_000)
  assert.equal(f.totalMs(), 70_000, "a cross-midnight lineage cut preserves all unaffected physical seconds")
  const left = f.events("2026-09-01")[0]
  assert.equal(left.startTs, midnightStart)
  assert.equal(left.endTs, new Date(2026, 8, 2).getTime())
  assert.equal(left.continuityId, undefined, "a cut invalidates only logical lineage, retaining exact remote-day evidence")
}
{
  const f = fixture()
  const midnight = new Date(2026, 8, 4).getTime()
  f.writer.ensureDay(date).events.push({ id: "legacy", actId: "a", start: "23:30", end: "00:00" })
  f.record("b", midnight - 20_000, midnight - 10_000)
  assert.equal(f.events(date).length, 3, "legacy midnight intervals share the physical-overlap contract")
  assert.equal(f.totalMs(), 30 * 60_000)
}
{
  const f = fixture()
  f.record("a", base + 10_000, base + 290_000)
  const day = f.state.days[date]
  f.writer.addInterval(day, "manual", 601, 603)
  assert.equal(day.events.length, 3)
  assert.ok(day.events.every(row => !row.startTs && !row.endTs && !row.continuityId), "manual minute edits still detach precision and logical lineage")
  assert.deepEqual(Array.from(day.events, row => [row.start, row.end]), [["10:00", "10:01"], ["10:01", "10:03"], ["10:03", "10:05"]])
}

console.log("continuity core tests passed")
