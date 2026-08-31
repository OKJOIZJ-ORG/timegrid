import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const start = html.indexOf("/* TODO_MUTATIONS_CORE_START */")
const end = html.indexOf("/* TODO_MUTATIONS_CORE_END */")
assert.ok(start >= 0 && end > start, "todo mutation core markers must exist")
assert.match(html, /todoMutations:TG_TODO_MUTATIONS\.normalizeList\(mergeList\(/, "3-way day merge must include mutations")
assert.match(html, /tx\.set\(ref,\{events:merged\.events,todos:merged\.todos,routines:merged\.routines,todoMutations:merged\.todoMutations/, "Firestore day writes must include mutations")

const source = html.slice(start, end) + "\n;globalThis.__core=TG_TODO_MUTATIONS;"
const context = { console, crypto: globalThis.crypto, Date, JSON, Map, Set, Math }
vm.createContext(context)
vm.runInContext(source, context)
const core = context.__core
const now = Date.UTC(2026, 7, 31, 12)

const todo = { id: "todo-1", title: "Draft", area: "Study", done: false, time: "09:00", end: "10:00" }
const move = core.create("move", todo, "2026-08-31", "2026-09-01", { id: "mut-move", at: now, deviceId: "test" })
const deletion = core.create("delete", todo, "2026-09-01", "2026-09-01", { id: "mut-delete", at: now + 1, deviceId: "test" })
assert.equal(move.kind, "move")
assert.equal(move.fromDate, "2026-08-31")
assert.equal(move.toDate, "2026-09-01")
assert.equal(deletion.kind, "delete")
assert.equal(deletion.deletedAt, now + 1)
assert.notEqual(move.id, deletion.id)

const merged = core.normalizeList([move, move, deletion], now + 2)
assert.equal(merged.length, 2, "mutation ids are idempotent")

const days = {
  "2026-08-31": { events: [], todos: [structuredClone(todo)], routines: [], todoMutations: [move] },
  "2026-09-01": { events: [], todos: [], routines: [], todoMutations: [move] },
}
core.materialize(days, now + 2)
assert.equal(days["2026-08-31"].todos.length, 0)
assert.equal(days["2026-09-01"].todos[0].id, todo.id, "move preserves the persistent todo id")

days["2026-09-01"].todoMutations.push(deletion)
core.materialize(days, now + 2)
assert.equal(days["2026-09-01"].todos.length, 0, "delete is materialized independently of array disappearance")
const once = JSON.stringify(days)
core.materialize(days, now + 2)
assert.equal(JSON.stringify(days), once, "repeated materialization is idempotent")

const restored = { ...todo, title: "Renamed", done: true, time: "11:00", end: "12:00" }
const restore = core.create("restore", restored, "2026-09-01", "2026-09-01", { id: "mut-restore", at: now + 3, deviceId: "test" })
days["2026-09-01"].todoMutations.push(restore)
core.materialize(days, now + 4)
assert.deepEqual(JSON.parse(JSON.stringify(days["2026-09-01"].todos[0])), restored)

const many = []
for (let i = 0; i < 300; i++) {
  many.push(core.create("delete", { id: `bulk-${i}` }, "2026-08-31", "2026-08-31", { id: `bulk-mut-${String(i).padStart(3, "0")}`, at: now + i }))
}
assert.equal(core.normalizeList(many, now + 300).length, core.MAX_PER_DAY, "metadata is count-bounded")
const expired = core.create("delete", { id: "old" }, "2026-01-01", "2026-01-01", { id: "old-mut", at: now - core.RETENTION_MS - 1 })
assert.equal(core.normalizeList([expired], now).length, 0, "metadata is retention-bounded")

console.log("todo mutation core tests passed")
