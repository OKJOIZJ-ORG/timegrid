import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const start = html.indexOf("/* CONTINUITY_CORE_START */")
const end = html.indexOf("/* CONTINUITY_CORE_END */")
assert.ok(start >= 0 && end > start, "continuity core markers must exist")
assert.match(html, /startTs:piece\.startTs,[\s\S]*endTs:piece\.endTs,[\s\S]*continuityId:spanId/, "canonical events retain exact time and lineage")
assert.match(html, /fragmentCount:pieces\.length/, "midnight spans retain one logical lineage across physical day fragments")
assert.match(html, /if\(!materializeExactSpan\(r,Number\(endTs\)\|\|Date\.now\(\)\)\)return false/, "stop materialization uses exact continuity")

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

console.log("continuity core tests passed")
