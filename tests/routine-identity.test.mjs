import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const start = html.indexOf("/* ROUTINE_IDENTITY_CORE_START */")
const end = html.indexOf("/* ROUTINE_IDENTITY_CORE_END */")
assert.ok(start >= 0 && end > start, "routine identity core markers must exist")
assert.match(html, /routineDefId:def\.routineDefId/, "instances retain their definition identity")
assert.match(html, /TG_ROUTINE_IDENTITY\.reconcile\(state\.settings,dateStr,day\.routines,day\.events\)/, "current/future days use deterministic reconciliation")
assert.match(html, /TG_ROUTINE_IDENTITY\.reconcile\(state\.settings,date,merged\.routines,merged\.events\)/, "remote writes from legacy clients are repaired before materialization")
assert.match(html, /TG_ROUTINE_IDENTITY\.reconcile\(state\.settings,dk,day\.routines\|\|\[\],day\.events\|\|\[\]\)/, "cached current and future days are repaired on startup")
assert.match(html, /routineDefs:TG_ROUTINE_DEFS\.normalize/, "remote settings normalize legacy routine definitions before merge")
assert.match(html, /routineDefId:rt\.routineDefId\|\|null/, "log import preserves supplied routine definition identity")

const source = html.slice(start, end) + "\n;globalThis.__core=TG_ROUTINE_IDENTITY;"
const context = {
  console,
  Date,
  JSON,
  Map,
  Set,
  Math,
  dateOf: value => {
    const [y, m, d] = value.split("-").map(Number)
    return new Date(y, m - 1, d)
  },
}
vm.createContext(context)
vm.runInContext(source, context)
const core = context.__core
const settings = { routineDefs: [
  { id: "rd01", time: "06:30", name: "기상", days: [2] },
  { id: "rd02", time: "07:00", name: "산책", days: [2] },
  { time: "06:30", name: "기상", days: [2] },
] }
const date = "2026-09-01"
assert.equal(core.defsForDate(settings, date).length, 2, "id-less legacy definitions are excluded")
const result = core.reconcile(settings, date, [
  { id: "legacy", time: "06:30", name: "기상", done: true },
  { id: "drop", time: "08:00", name: "old", done: false },
], [])
assert.equal(result.routines[0].id, "legacy")
assert.equal(result.routines[0].routineDefId, "rd01")
assert.equal(result.routines[1].id, core.instanceId(date, "rd02"))
assert.equal(result.report.droppedUnmeasured, 1)
assert.equal(core.reconcile(settings, date, result.routines, []).changed, false)

const definitionStart = html.indexOf("/* ROUTINE_DEFINITION_MIGRATION_CORE_START */")
const definitionEnd = html.indexOf("/* ROUTINE_DEFINITION_MIGRATION_CORE_END */")
assert.ok(definitionStart >= 0 && definitionEnd > definitionStart)
const definitionContext = { console, JSON, Math, Number, Set }
vm.createContext(definitionContext)
vm.runInContext(html.slice(definitionStart, definitionEnd) + "\n;globalThis.__defs=TG_ROUTINE_DEFS;", definitionContext)
const defs = definitionContext.__defs.normalize([
  { id: "rd01", time: "06:30", name: "기상", days: [2] },
  { time: "06:30", name: "기상", days: [2] },
  { time: "07:00", name: "산책", days: [2] },
])
assert.equal(defs.length, 2, "id-less semantic duplicates do not return through device settings sync")
assert.match(defs[1].id, /^rd_legacy_/, "standalone legacy definitions receive deterministic identities")
assert.equal(definitionContext.__defs.normalize(defs)[1].id, defs[1].id)

console.log("routine identity core tests passed")
