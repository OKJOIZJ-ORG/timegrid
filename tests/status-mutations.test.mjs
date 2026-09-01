import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const start = html.indexOf("/* STATUS_MUTATIONS_CORE_START */")
const end = html.indexOf("/* STATUS_MUTATIONS_CORE_END */")
assert.ok(start >= 0 && end > start, "status mutation core markers must exist")
assert.match(html, /statusMutations:TG_STATUS_MUTATIONS\.normalizeList\(mergeList\(/, "3-way day merge unions status mutations")
assert.match(html, /tx\.set\(ref,\{events:merged\.events,todos:merged\.todos,routines:merged\.routines,todoMutations:merged\.todoMutations,statusMutations:merged\.statusMutations/, "Firestore day writes include status mutations")
assert.match(html, /setEntityDone\(day,"todo",td\.id,cb\.checked\)/, "todo checkbox emits an explicit mutation")
assert.match(html, /setEntityDone\(day,"routine",rt\.id,cb\.checked\)/, "routine checkbox emits an explicit mutation")

const source = html.slice(start, end) + "\n;globalThis.__core=TG_STATUS_MUTATIONS;"
const context = { console, crypto: globalThis.crypto, Date, JSON, Map, Set, Math }
vm.createContext(context)
vm.runInContext(source, context)
const core = context.__core
const now = Date.UTC(2026, 8, 1, 12)

const done = core.create("todo", "t1", true, { id: "a", at: now, deviceId: "device-a" })
const reopen = core.create("todo", "t1", false, { id: "b", existing: [done], wallMs: now - 1000, deviceId: "device-b" })
assert.equal(reopen.at, now + 1)
const day = { todos: [{ id: "t1", done: true }], routines: [], statusMutations: [reopen] }
core.materializeDay(day, now + 2)
assert.equal(day.todos[0].done, false, "mutation result overrides stale embedded done")
const once = JSON.stringify(day)
core.materializeDay(day, now + 2)
assert.equal(JSON.stringify(day), once, "materialization is idempotent")

const simultaneousA = core.create("routine", "r1", true, { id: "c", at: now + 3, deviceId: "a" })
const simultaneousB = core.create("routine", "r1", false, { id: "d", at: now + 3, deviceId: "b" })
const day2 = { todos: [], routines: [{ id: "r1", done: true }], statusMutations: core.normalizeList([simultaneousB], [simultaneousA], now + 4) }
core.materializeDay(day2, now + 4)
assert.equal(day2.routines[0].done, false, "same-time concurrent writes converge by device/id tie-break")

console.log("status mutation core tests passed")
